#!/usr/bin/env bash
# 마이그레이션을 실제 Postgres에 적용해 보는 일회용 검사대.
#
# 스키마 변경은 소스를 읽어서 확인할 수가 없다 — on delete 절이 맞게 붙었는지,
# 삭제가 실제로 뚫리는지는 돌려봐야 안다. 운영 DB에 대고 시험할 수는 없으니
# 빈 컨테이너에 schema.sql을 붓고 거기서 본다.
#
# 컨테이너는 매번 새로 만들고 끝나면 지운다. 상태를 남기면 "저번에 뭘 했더라"가 된다.
#
# 쓰는 법:  bash supabase/test/run.sh
set -euo pipefail
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")/../.."

C=pgtest$$
PSQL="docker exec -i $C psql -U postgres -q -v ON_ERROR_STOP=1"
cleanup() { docker rm -f $C >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name $C -e POSTGRES_PASSWORD=x postgres:15-alpine >/dev/null
for _ in $(seq 1 30); do docker exec $C pg_isready -U postgres >/dev/null 2>&1 && break; sleep 2; done

# Supabase가 주는 것들 — 로컬 Postgres에는 없어서 최소한만 흉내 낸다.
# auth.uid()가 null을 돌려주는 건 의도한 것이다. 여기서 보는 건 RLS가 아니라 FK다.
$PSQL <<'SQL'
create extension if not exists pgcrypto;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
-- Supabase는 JWT 클레임을 GUC로 넣고 auth.uid()가 거기서 읽는다. 같은 자리를 쓴다 —
-- 그래야 검사에서 「누구로 부르는지」를 set 한 줄로 바꿀 수 있다.
create function auth.uid() returns uuid language sql stable as $f$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
create role authenticated; create role anon;
-- 아바타 마이그레이션이 storage.buckets를 건드린다. Storage는 여기서 볼 대상이 아니라
-- 마이그레이션이 끝까지 도는 데 필요한 만큼만 흉내 낸다.
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean default false);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
create function storage.foldername(text) returns text[] language sql immutable as $f$ select string_to_array($1,'/') $f$;
SQL

# schema.sql만 부으면 production과 다른 DB가 나온다 — 20260727 리디자인이 settlements와
# payments를 drop하고 다시 만드는 등, 마이그레이션이 스키마를 실제로 갈아치운다.
# 파일명 순서가 곧 적용 순서다(날짜 접두사).
$PSQL < supabase/schema.sql
for f in supabase/migrations/*.sql; do
  [ "$f" = "supabase/migrations/20260824_account_deletion_fks.sql" ] && continue
  $PSQL < "$f" || { echo "!! 마이그레이션 실패: $f"; exit 1; }
done

# D-1은 총무 계정을 실제로 지운다. D-2는 살아 있는 총무가 필요하니 다시 심을 수 있게 함수로 둔다.
seed() {
  $PSQL -c "truncate auth.users cascade;" >/dev/null
$PSQL <<'SQL'
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222');
update profiles set display_name='총무' where id='11111111-1111-1111-1111-111111111111';
update profiles set display_name='멤버' where id='22222222-2222-2222-2222-222222222222';
insert into teams (id,name,invite_code,created_by) values ('aaaaaaaa-0000-0000-0000-000000000001','테스트팀','abcd1234','11111111-1111-1111-1111-111111111111');
insert into team_members (id,team_id,user_id,role) values
  ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','admin'),
  ('bbbbbbbb-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','member');
insert into matches (id,team_id,match_date,created_by) values ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',now(),'bbbbbbbb-0000-0000-0000-000000000001');
insert into attendance_votes (match_id,team_member_id,status) values ('cccccccc-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','attend');
insert into settlements (id,match_id,team_id,total_amount,per_person,created_by)
  values ('dddddddd-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',60000,30000,'bbbbbbbb-0000-0000-0000-000000000001');
insert into settlement_shares (settlement_id,team_member_id,amount,confirmed_at) values
  ('dddddddd-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001',30000,now()),  -- 총무는 냈다
  ('dddddddd-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002',30000,null);   -- 멤버는 미납
insert into announcements (team_id,author_id,title,body) values ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','제목','공지');
insert into polls (team_id,author_id,question,options) values ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','투표?','["A","B"]'::jsonb);
SQL
}

# 총무 한 명 + 멤버 한 명. 총무는 경기·공지·투표를 만들었다 — 즉 NO ACTION 외래키
# 3개에 걸려 있고, 팀 생성자라 teams.created_by에도 걸린다. profiles는 트리거가 만든다.
#
# 정산은 settlement_shares다. schema.sql의 payments가 아니다 — 20260727 리디자인이
# payments를 drop했다. 멤버 몫은 미납(confirmed_at is null)으로 둔다: D-2가 쓴다.
seed

# ── D-1 ──────────────────────────────────────────────────────────
# 고치기 전에 실제로 막히는지부터 본다. 안 막히면 이 마이그레이션은 아무것도 안 고치는 것이다.
if $PSQL -c "delete from auth.users where id='11111111-1111-1111-1111-111111111111'" 2>/dev/null; then
  echo "!! 고치기 전인데 삭제가 됐다 — 전제가 틀렸다"; exit 1
fi
echo "고치기 전  : 총무 삭제 막힘 (기대한 대로)"

$PSQL < supabase/migrations/20260824_account_deletion_fks.sql
$PSQL <<'SQL'
do $$ begin
  -- 5개가 전부 set null이 됐는가
  if (select count(*) from pg_constraint c
        join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
       where c.contype='f' and c.confdeltype='n'
         and (c.conrelid::regclass::text,a.attname) in
             (('teams','created_by'),('matches','created_by'),
              ('announcements','author_id'),('polls','author_id'))) <> 4
  then raise exception 'set null이 4개가 아니다'; end if;

  -- 놓친 게 없는지 반대로도 본다: 아직 삭제를 막는 외래키가 남아 있으면 안 된다
  if exists (select 1 from pg_constraint c
              where c.contype='f' and c.confdeltype='a'
                and c.confrelid::regclass::text in ('profiles','team_members'))
  then raise exception '아직 삭제를 막는 외래키가 남아 있다'; end if;
end $$;

delete from auth.users where id='11111111-1111-1111-1111-111111111111';

do $$ begin
  -- 팀의 기록은 남아야 한다. 작성자만 빠진다.
  if (select count(*) from matches)       <> 1 then raise exception '경기가 사라졌다'; end if;
  if (select count(*) from announcements) <> 1 then raise exception '공지가 사라졌다'; end if;
  if (select count(*) from polls)         <> 1 then raise exception '투표가 사라졌다'; end if;
  if (select count(*) from settlements)   <> 1 then raise exception '정산이 사라졌다'; end if;
  -- 총무 몫은 team_members cascade로 같이 빠진다. 멤버 몫(미납)은 남아야 한다
  if (select count(*) from settlement_shares) <> 1 then raise exception '남은 멤버의 정산 몫까지 빠졌다'; end if;
  if (select count(*) from teams)         <> 1 then raise exception '팀이 사라졌다'; end if;
  if (select created_by from matches) is not null then raise exception '작성자가 안 비었다'; end if;

  -- 참석 기록은 일부러 지운다 (약관 제4조 ② 「지체 없이 파기」)
  if (select count(*) from attendance_votes) <> 0 then raise exception '참석 기록이 남았다'; end if;

  -- 남은 멤버의 소속은 그대로여야 한다
  if (select count(*) from team_members) <> 1 then raise exception '남은 멤버까지 빠졌다'; end if;
end $$;
SQL
echo "고친 뒤    : 삭제 통과 · 경기/공지/투표/정산 남음 · 참석 기록만 파기"

# ── 롤백 ─────────────────────────────────────────────────────────
# null이 남아 있으면 롤백이 멈춰야 한다.
#
# 「실패하는가」만 보면 이 검사는 아무것도 안 본다 — 가드가 없어도 set not null이
# 어차피 터지기 때문이다(변이 시험에서 실제로 통과했다). 가드의 값은 실패가 아니라
# 실패하기 전에 어디에 몇 개인지 한 번에 말해 주는 것이다. Postgres 기본 오류는
# 테이블 하나만 알려줘서 네 번을 되풀이해야 한다. 그래서 메시지를 본다.
RB_ERR=$($PSQL < supabase/rollback/20260824_account_deletion_fks.sql 2>&1 && echo __PASSED__) || true   # set -e가 여기서 죽지 않게
if [[ "$RB_ERR" == *__PASSED__* ]]; then
  echo "!! null이 있는데 롤백이 통과했다"; exit 1
fi
for t in "teams.created_by : 1행" "matches.created_by : 1행"          "announcements.author_id : 1행" "polls.author_id : 1행"; do
  if [[ "$RB_ERR" != *"$t"* ]]; then
    echo "!! 롤백이 멈추긴 했는데 「$t」를 안 알려준다 — 어디를 고쳐야 할지 모른다"
    echo "   받은 메시지: $RB_ERR"; exit 1
  fi
done
$PSQL <<'SQL'
do $$ begin
  -- 실패했으면 아무것도 안 바뀌어 있어야 한다 (DDL이 트랜잭션이므로)
  if (select count(*) from pg_constraint c
        join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
       where c.contype='f' and c.confdeltype='n'
         and (c.conrelid::regclass::text,a.attname) in
             (('teams','created_by'),('matches','created_by'),
              ('announcements','author_id'),('polls','author_id'))) <> 4
  then raise exception '롤백이 실패했는데 제약이 바뀌었다 — 반쯤 적용됐다'; end if;
end $$;
SQL
echo "롤백(null) : 막힘 · 네 곳을 행 수까지 지목 · 제약은 그대로"

# 주인을 정해 주면 되돌아가야 한다
$PSQL <<'SQL'
update teams         set created_by='22222222-2222-2222-2222-222222222222' where created_by is null;
update matches       set created_by='bbbbbbbb-0000-0000-0000-000000000002' where created_by is null;
update announcements set author_id ='bbbbbbbb-0000-0000-0000-000000000002' where author_id  is null;
update polls         set author_id ='bbbbbbbb-0000-0000-0000-000000000002' where author_id  is null;
SQL
$PSQL < supabase/rollback/20260824_account_deletion_fks.sql
# 메타데이터가 아니라 동작이 돌아왔는지 본다 — 다시 막혀야 진짜 롤백이다
if $PSQL -c "delete from auth.users where id='22222222-2222-2222-2222-222222222222'" 2>/dev/null; then
  echo "!! 롤백했는데 삭제가 여전히 된다"; exit 1
fi
echo "롤백(정리) : 되돌아감 · 삭제가 다시 막힘"

# 두 번 적용해도 안전한가 (제약이 중복 생성되면 안 된다)
$PSQL < supabase/migrations/20260824_account_deletion_fks.sql
$PSQL < supabase/migrations/20260824_account_deletion_fks.sql
echo "재실행     : 2회 적용 안전"

# ── D-2 ──────────────────────────────────────────────────────────
seed   # D-1이 총무를 지웠다
$PSQL < supabase/migrations/20260824_account_deletion_status.sql

# 멤버(미납 1건)와 총무(완납, 팀에 미납 1건)로 각각 불러 본다
as_member="set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';"
as_admin="set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';"
# psql은 SET의 명령 태그도 stdout에 찍는다 — 마지막 줄만 취한다
ask() { docker exec -i $C psql -U postgres -tAc "$1" -c "select account_deletion_status()" | tail -1; }

[ "$(ask "$as_member" | python -c 'import sys,json; print(json.load(sys.stdin)["unpaid_own"])')" = "1" ]   || { echo "!! 멤버의 미납 1건을 못 셌다"; exit 1; }
[ "$(ask "$as_admin"  | python -c 'import sys,json; print(json.load(sys.stdin)["unpaid_own"])')" = "0" ]   || { echo "!! 총무는 냈는데 미납으로 셌다"; exit 1; }
echo "D-2 본인   : 미납 1건 잡음 · 낸 사람은 0"

# 총무는 막히지 않지만, 팀의 미납은 안내로 나와야 한다
[ "$(ask "$as_admin" | python -c 'import sys,json; d=json.load(sys.stdin)["admin_teams"][0]; print(d["unpaid_team"], d["other_admins"], d["members"])')" = "1 0 2" ]   || { echo "!! 총무 안내(팀 미납/다른 총무/멤버 수)가 틀렸다: $(ask "$as_admin")"; exit 1; }
echo "D-2 총무   : 안 막힘 · 팀 미납 1건은 안내로 나옴 · 다른 총무 0명"

# 본인이 「보냈어요」를 누르면 통과해야 한다 — 총무 확인을 기다리다 탈퇴가 막히면 안 된다
$PSQL -c "update settlement_shares set marked_paid_at=now() where team_member_id='bbbbbbbb-0000-0000-0000-000000000002'"
[ "$(ask "$as_member" | python -c 'import sys,json; print(json.load(sys.stdin)["unpaid_own"])')" = "0" ]   || { echo "!! 입금 신고를 했는데 여전히 막는다 — 남의 확인에 걸린다"; exit 1; }
# 반면 총무 쪽 안내는 그대로여야 한다 (확인은 아직 안 됐으니 인수인계 대상이다)
[ "$(ask "$as_admin" | python -c 'import sys,json; print(json.load(sys.stdin)["admin_teams"][0]["unpaid_team"])')" = "1" ]   || { echo "!! 신고만 된 건이 총무 안내에서 사라졌다"; exit 1; }
echo "D-2 신고   : 본인은 통과 · 총무 안내에는 남음"

# 면제와 마감된 정산은 안 센다
$PSQL -c "update settlement_shares set marked_paid_at=null, exempt=true where team_member_id='bbbbbbbb-0000-0000-0000-000000000002'"
[ "$(ask "$as_member" | python -c 'import sys,json; print(json.load(sys.stdin)["unpaid_own"])')" = "0" ]   || { echo "!! 면제인데 미납으로 셌다"; exit 1; }
$PSQL -c "update settlement_shares set exempt=false where team_member_id='bbbbbbbb-0000-0000-0000-000000000002'; update settlements set status='done';"
[ "$(ask "$as_member" | python -c 'import sys,json; print(json.load(sys.stdin)["unpaid_own"])')" = "0" ]   || { echo "!! 마감된 정산인데 미납으로 셌다"; exit 1; }
echo "D-2 제외   : 면제 · 마감된 정산은 안 셈"

echo
echo "d1 ok / d2 ok"
