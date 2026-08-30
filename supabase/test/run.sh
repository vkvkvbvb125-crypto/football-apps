#!/usr/bin/env bash
# 마이그레이션을 실제 Postgres에 적용해 보는 일회용 검사대.
#
# 스키마 변경은 소스를 읽어서 확인할 수가 없다 — on delete 절이 맞게 붙었는지,
# 삭제가 실제로 뚫리는지는 돌려봐야 안다. 운영 DB에 대고 시험할 수는 없으니
# 빈 컨테이너에 schema.sql을 붓고 거기서 본다.
#
# 컨테이너는 매번 새로 만들고 끝나면 지운다. 상태를 남기면 "저번에 뭘 했더라"가 된다.
#
# ── RLS 시험은 종료 코드가 아니라 값으로 판정한다 ───────────────────
#
# **RLS가 막은 UPDATE는 오류가 아니라 0행이다.** using이 행을 걸러내면 psql은 그냥
# 성공으로 끝나고 $?는 0이다. 「거절됐다」와 「바꿀 행이 없었다」의 출력이 같다.
#
# 이 함정에 세 번 걸렸다 — ③-a 마감 정책, ③-b 트리거, matches 수정 정책.
# 세 번이면 다음에도 걸리므로 규칙으로 박는다:
#
#   쓰기를 막았는지 볼 때는 **그 값을 다시 읽어서** 안 바뀐 것을 확인한다.
#   종료 코드는 판정이 아니다.
#
# INSERT는 다르다 — with check 위반은 진짜 오류(42501)라 종료 코드로 갈린다.
# upsert(insert ... on conflict do update)도 오류를 낸다. **plain UPDATE만 조용하다.**
#
# ── 검사대 안에서도 순서 의존이 생긴다 ──────────────────────────────
#
# 이 파일은 위에서 아래로 한 컨테이너에서 돈다. 앞 단계가 데이터를 바꿔 놓으면
# 뒤 단계가 그 위에서 돈다 — D-3(위임)이 멤버 2222를 팀 1의 **총무로 만들어 둔다.**
# 그걸 모르고 2222를 「남의 팀 총무」로 써서 「남이 경기를 고칠 수 있다」가 나왔고,
# 원인은 정책이 아니라 앞선 단계였다.
#
#   새 단계를 붙일 때 쓰려는 사람·팀·경기가 앞에서 어떻게 바뀌었는지 먼저 본다.
#   확실하지 않으면 그 단계에서 쓸 것을 새로 만든다(3333처럼).
#
# 그리고 새 마이그레이션은 준비 단계가 migrations/*.sql을 전부 부으므로 **이미 적용돼
# 있다.** 「고치기 전」을 보려면 롤백을 먼저 태워야 한다.
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

# ── D-3 ──────────────────────────────────────────────────────────
seed
$PSQL < supabase/migrations/20260824_account_deletion_status.sql
$PSQL < supabase/migrations/20260824_account_deletion_handover.sql
$PSQL < supabase/migrations/20260824_account_deletion_uid_guard.sql
field() { ask "$1" | python -c "import sys,json;d=json.load(sys.stdin);print($2)"; }

# 총무가 혼자고 멤버가 남아 있다 → 넘기기 전에는 못 나간다
[ "$(field "$as_admin" 'd["can_delete"], d["admin_teams"][0]["needs_handover"]')" = "False True" ]   || { echo "!! 마지막 총무인데 삭제가 허용된다: $(ask "$as_admin")"; exit 1; }
echo "D-3 미위임 : 거부 · needs_handover"

# 멤버 쪽은 총무가 아니라 위임과 무관하다 (미납만 걸린다)
[ "$(field "$as_member" 'd["can_delete"], len(d["admin_teams"])')" = "False 0" ]   || { echo "!! 멤버 판정이 틀렸다"; exit 1; }
$PSQL -c "update settlement_shares set confirmed_at=now() where team_member_id='bbbbbbbb-0000-0000-0000-000000000002'"
[ "$(field "$as_member" 'd["can_delete"]')" = "True" ]   || { echo "!! 미납을 정리한 멤버가 여전히 막힌다"; exit 1; }
echo "D-3 멤버   : 미납 정리하면 통과 · 위임과 무관"

# 「총무 임명」과 같은 동작 — 다른 멤버를 admin으로
$PSQL -c "update team_members set role='admin' where id='bbbbbbbb-0000-0000-0000-000000000002'"
[ "$(field "$as_admin" 'd["can_delete"], d["admin_teams"][0]["needs_handover"], d["admin_teams"][0]["other_admins"]')" = "True False 1" ]   || { echo "!! 위임했는데 여전히 막힌다: $(ask "$as_admin")"; exit 1; }
echo "D-3 위임후 : 통과 (총무 임명이 곧 위임이다)"

# 혼자인 팀은 넘길 상대가 없다 → 막지 않는다
seed
$PSQL -c "delete from team_members where id='bbbbbbbb-0000-0000-0000-000000000002'"
[ "$(field "$as_admin" 'd["can_delete"], d["admin_teams"][0]["needs_handover"], d["admin_teams"][0]["members"]')" = "True False 1" ]   || { echo "!! 혼자인 팀인데 위임을 요구한다: $(ask "$as_admin")"; exit 1; }
echo "D-3 혼자   : 통과 (넘길 상대가 없다)"

# 그렇게 나간 뒤 팀이 실제로 안 보이는가 — D-4를 안 만든 근거다
$PSQL -c "delete from auth.users where id='11111111-1111-1111-1111-111111111111'"
[ "$($PSQL -tAc "select count(*) from team_members where team_id='aaaaaaaa-0000-0000-0000-000000000001'" | tail -1)" = "0" ]   || { echo "!! 멤버가 남았다"; exit 1; }
[ "$(docker exec -i $C psql -U postgres -tAc "$as_admin" -c "select is_team_member('aaaaaaaa-0000-0000-0000-000000000001')" | tail -1)" = "f" ]   || { echo "!! 멤버 0명인 팀이 아직 보인다 — 팀 삭제가 따로 필요하다"; exit 1; }
echo "D-4 유령팀 : 멤버 0명 → teams_select가 감춤 (팀 삭제 불필요)"

# 로그인하지 않은 호출은 「모른다」가 아니라 「안 된다」여야 한다.
# me가 비면 미납 0 · 관리 팀 0이 되어 can_delete가 참으로 나온다 — 판정이 헛돌면
# 삭제가 그대로 진행된다. 호출자가 실수해도 여기서 닫힌다.
[ "$(docker exec -i $C psql -U postgres -tAc "reset request.jwt.claim.sub;" -c "select account_deletion_status()" | tail -1 | python -c 'import sys,json;d=json.load(sys.stdin);print(d["can_delete"], d.get("reason"))')" = "False no_auth" ] \
  || { echo "!! 로그인 없이 불렀는데 삭제를 허용한다 (fail-open)"; exit 1; }
echo "D-5 무인증 : 거부 (fail-closed)"

# ── 투표 마감 정책 (20260828) ────────────────────────────────────
#
# RLS를 보는 첫 검사다. D-1~D-3는 postgres(슈퍼유저)로 돌았는데 슈퍼유저는 RLS를 통과한다 —
# 여기서는 set role authenticated로 바꿔야 정책이 실제로 걸린다. auth.uid()는 위에서
# GUC를 읽게 만들어 뒀으므로 request.jwt.claim.sub 한 줄로 「누구로 부르는지」가 바뀐다.
#
# 조건을 더하면서 기존 조건이 무너지는 게 정책 변경의 흔한 사고다. 새로 막는 것만 보면
# 놓친다 — locked/completed와 「남의 표」도 매번 다시 본다.
seed
$PSQL <<'SQL'
-- Supabase가 authenticated에게 주는 권한을 여기서 흉내 낸다.
-- auth 스키마 usage가 빠지면 정책 안의 auth.uid()에서 「permission denied for schema auth」가
-- 나고, 그러면 **모든 쓰기가 거절된다** — 정책이 옳아서 막힌 건지 권한이 없어 막힌 건지
-- 구별이 안 된다. 실제로 「고치기 전인데 이미 막힌다」로 한 번 헛짚었다.
grant usage on schema auth to authenticated;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- 경기 넷: 마감 지남 / 마감 전 / 마감 없음(기본 seed의 것) / locked / completed
insert into matches (id,team_id,match_date,vote_deadline,status,created_by) values
  ('cccccccc-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001',now()+interval '1 day', now()-interval '1 hour','open','bbbbbbbb-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-00000000000b','aaaaaaaa-0000-0000-0000-000000000001',now()+interval '2 day', now()+interval '1 hour','open','bbbbbbbb-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-000000000001',now()+interval '3 day', null,'open','bbbbbbbb-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-00000000000d','aaaaaaaa-0000-0000-0000-000000000001',now()+interval '4 day', now()+interval '1 hour','locked','bbbbbbbb-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-00000000000e','aaaaaaaa-0000-0000-0000-000000000001',now()+interval '5 day', now()+interval '1 hour','completed','bbbbbbbb-0000-0000-0000-000000000001');
SQL

# 멤버로 한 표 넣어 본다. 되면 0, 막히면 1.
vote() {   # vote <match-suffix> [status]
  docker exec -i $C psql -U postgres -q -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL && echo 0 || echo 1
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into attendance_votes (match_id,team_member_id,status)
values ('cccccccc-0000-0000-0000-00000000000$1','bbbbbbbb-0000-0000-0000-000000000002','${2:-attend}');
SQL
}
# RLS가 막은 UPDATE는 **오류가 아니라 0행**이다 — using 절이 행을 걸러내면 psql은 그냥
# 성공한다. 그래서 종료 코드로 판정하면 「통과했다」로 읽힌다(실제로 한 번 그렇게 읽었다).
# 값이 실제로 바뀌었는지를 본다.
status_of() { $PSQL -tAc "select status from attendance_votes where match_id='cccccccc-0000-0000-0000-00000000000$1' and team_member_id='bbbbbbbb-0000-0000-0000-000000000002'" | tail -1 | tr -d ' '; }
revote() { # revote <match-suffix> <status>
  docker exec -i $C psql -U postgres -q >/dev/null 2>&1 <<SQL
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
update attendance_votes set status='$2'
 where match_id='cccccccc-0000-0000-0000-00000000000$1' and team_member_id='bbbbbbbb-0000-0000-0000-000000000002';
SQL
  status_of "$1"
}
# 앱이 실제로 쓰는 경로. INSERT ... ON CONFLICT DO UPDATE는 UPDATE와 달리 using에
# 걸리면 조용히 넘어가지 않고 오류를 낸다 — 그래서 화면이 실패를 알 수 있다.
upsert() { # upsert <match-suffix> <status>
  docker exec -i $C psql -U postgres -q -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL && echo 0 || echo 1
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into attendance_votes (match_id,team_member_id,status)
values ('cccccccc-0000-0000-0000-00000000000$1','bbbbbbbb-0000-0000-0000-000000000002','$2')
on conflict (match_id, team_member_id) do update set status = excluded.status;
SQL
}
rows() { $PSQL -tAc "select count(*) from attendance_votes where match_id='cccccccc-0000-0000-0000-00000000000$1'" | tail -1; }
clear_votes() { $PSQL -c "delete from attendance_votes where match_id::text like 'cccccccc-0000-0000-0000-00000000000%'" >/dev/null; }

# 고치기 전 — 옛 정책을 되돌려 구멍이 실제로 있는지부터 본다.
# 없으면 이 마이그레이션은 아무것도 안 고치는 것이다.
$PSQL < supabase/rollback/20260828_votes_deadline_policy.sql
[ "$(vote a)" = "0" ] || { echo "!! 고치기 전인데 마감 지난 경기가 이미 막힌다 — 전제가 틀렸다"; exit 1; }
echo "고치기 전  : 마감 지난 open 경기에 표가 들어감 (구멍 확인)"
clear_votes

$PSQL < supabase/migrations/20260828_votes_deadline_policy.sql

# 새로 막는 것
[ "$(vote a)" = "1" ] || { echo "!! 마감 지난 경기에 INSERT가 통과한다"; exit 1; }
[ "$(rows a)" = "0" ] || { echo "!! 거절됐다는데 행이 남았다"; exit 1; }
echo "마감 지남  : INSERT 거절"

# UPDATE도 막혀야 한다. 마감 전에 넣어 두고 시계를 넘긴다 —
# 「마감 전에 찍어 둔 표를 마감 뒤에 바꾸기」가 실제 경로다.
[ "$(vote b)" = "0" ] || { echo "!! 마감 전 경기에 INSERT가 막힌다"; exit 1; }
echo "마감 전    : INSERT 통과"
[ "$(revote b absent)" = "absent" ] || { echo "!! 마감 전 경기에 UPDATE가 막힌다"; exit 1; }
[ "$(upsert b undecided)" = "0" ] || { echo "!! 마감 전 경기에 upsert가 막힌다"; exit 1; }
[ "$(status_of b)" = "undecided" ] || { echo "!! 마감 전 upsert가 값을 안 바꿨다"; exit 1; }
echo "마감 전    : UPDATE·upsert 통과"

$PSQL -c "update matches set vote_deadline=now()-interval '1 hour' where id='cccccccc-0000-0000-0000-00000000000b'" >/dev/null
[ "$(revote b attend)" = "undecided" ] || { echo "!! 마감이 지났는데 UPDATE로 값이 바뀌었다"; exit 1; }
[ "$(upsert b attend)" = "1" ] || { echo "!! 마감이 지났는데 upsert가 통과한다 — 앱이 쓰는 경로다"; exit 1; }
[ "$(status_of b)" = "undecided" ] || { echo "!! 거절됐다는데 값이 바뀌었다"; exit 1; }
echo "마감 지남  : UPDATE 0행 · upsert 오류 · 값 그대로"

# null — 이 마이그레이션의 유일한 위험이다.
# `and m.vote_deadline >= now()`라고만 쓰면 조건이 unknown이 되어 마감을 안 정한 팀이
# 통째로 막힌다. 화면으로는 절대 안 잡히는 종류다.
[ "$(vote c)" = "0" ] || { echo "!! 마감을 안 정한 경기(null)에 INSERT가 막힌다 — null 처리가 빠졌다"; exit 1; }
[ "$(revote c absent)" = "absent" ] || { echo "!! 마감을 안 정한 경기(null)에 UPDATE가 막힌다"; exit 1; }
[ "$(upsert c undecided)" = "0" ] || { echo "!! 마감을 안 정한 경기(null)에 upsert가 막힌다"; exit 1; }
echo "마감 없음  : INSERT/UPDATE 통과 (null이 거절로 안 새어감)"

# 기존 조건이 안 무너졌는가
[ "$(vote d)" = "1" ] || { echo "!! locked 경기에 표가 들어간다 — 기존 조건이 무너졌다"; exit 1; }
[ "$(vote e)" = "1" ] || { echo "!! completed 경기에 표가 들어간다 — 기존 조건이 무너졌다"; exit 1; }
echo "기존 조건  : locked / completed 여전히 거절"

# 남의 표 — team_member_id 조건이 안 무너졌는가.
# 마감 전 경기(c)에 총무의 membership으로 넣어 본다. 멤버로 로그인한 채다.
if docker exec -i $C psql -U postgres -q -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<'SQL'
set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
insert into attendance_votes (match_id,team_member_id,status)
values ('cccccccc-0000-0000-0000-00000000000c','bbbbbbbb-0000-0000-0000-000000000001','attend');
SQL
then echo "!! 남의 표를 넣을 수 있다 — team_member_id 조건이 무너졌다"; exit 1; fi
echo "기존 조건  : 남의 표 여전히 거절"

# 롤백 — 메타데이터가 아니라 동작으로 본다
clear_votes
$PSQL < supabase/rollback/20260828_votes_deadline_policy.sql
[ "$(vote a)" = "0" ] || { echo "!! 롤백했는데 마감 지난 경기가 여전히 막힌다"; exit 1; }
echo "롤백       : 되돌아감 (구멍이 다시 열림 = 원래 동작)"

# 두 번 적용해도 안전한가
$PSQL < supabase/migrations/20260828_votes_deadline_policy.sql
$PSQL < supabase/migrations/20260828_votes_deadline_policy.sql
clear_votes
[ "$(vote a)" = "1" ] || { echo "!! 두 번 적용하니 정책이 깨졌다"; exit 1; }
echo "재실행     : 2회 적용 안전"

# ── 투표 updated_at 트리거 (20260828) ────────────────────────────
#
# 이 컬럼은 장식이 아니라 값을 만든다 — capacity.ts가 대기 순번을 updated_at 순으로
# 매긴다. 그래서 「안 오른다」와 「너무 자주 오른다」가 둘 다 사고다.
#   안 오르면  : 마음을 바꾼 사람이 처음 응답 시각을 들고 정원 안에 남는다
#   자주 오르면: 같은 pill을 다시 누른 것만으로 맨 뒤로 밀린다
# when 절이 그 둘 사이를 가른다. 여기서 보는 것도 그 둘이다.

ts_of() { $PSQL -tAc "select extract(epoch from updated_at)::text from attendance_votes where match_id='cccccccc-0000-0000-0000-00000000000c' and team_member_id='bbbbbbbb-0000-0000-0000-000000000002'" | tail -1 | tr -d ' '; }
gt() { awk -v a="$1" -v b="$2" 'BEGIN{exit !(a>b)}'; }

# 고치기 전 — 구멍이 실제로 있는지부터. 없으면 이 마이그레이션은 아무것도 안 고친다.
#
# 위 준비 단계가 migrations/*.sql을 전부 붓는다 — 이 트리거도 이미 걸려 있다.
# 그래서 롤백을 먼저 태워야 여기가 진짜 「고치기 전」이 된다. 안 그러면 구멍 확인이
# 「이미 고쳐져 있다」로 실패하는데, 그건 마이그레이션이 틀려서가 아니다.
$PSQL < supabase/rollback/20260828_votes_updated_at_trigger.sql
clear_votes
[ "$(vote c)" = "0" ] || { echo "!! 재료 준비 실패 — 마감 없는 경기에 표가 안 들어간다"; exit 1; }
t0=$(ts_of)
[ "$(upsert c absent)" = "0" ] || { echo "!! 재료 준비 실패 — 재투표가 막힌다"; exit 1; }
[ "$(ts_of)" = "$t0" ] || { echo "!! 고치기 전인데 updated_at이 이미 오른다 — 다른 것이 갱신하고 있다"; exit 1; }
echo "고치기 전  : 재투표해도 updated_at이 그대로 (구멍 확인)"

$PSQL < supabase/migrations/20260828_votes_updated_at_trigger.sql

# 상태가 바뀌면 오른다 — 앱이 타는 경로(upsert)로 본다
clear_votes
vote c >/dev/null
t0=$(ts_of)
[ "$(upsert c absent)" = "0" ] || { echo "!! 트리거를 붙이니 재투표가 막힌다"; exit 1; }
t1=$(ts_of)
gt "$t1" "$t0" || { echo "!! 상태가 바뀌었는데 updated_at이 안 오른다"; exit 1; }
echo "상태 바뀜  : updated_at 오름"

# 상태가 같으면 그대로 — 같은 pill 재탭 경로다.
# upsert(앱 경로)와 맨 UPDATE 둘 다 본다. when 절이 빠지면 여기서 걸린다.
[ "$(upsert c absent)" = "0" ] || { echo "!! 같은 상태 upsert가 막힌다"; exit 1; }
[ "$(ts_of)" = "$t1" ] || { echo "!! 상태가 같은데 updated_at이 올랐다 — 재탭만으로 대기 순번이 밀린다"; exit 1; }
[ "$(revote c absent)" = "absent" ] || { echo "!! 같은 상태 UPDATE가 막힌다"; exit 1; }
[ "$(ts_of)" = "$t1" ] || { echo "!! 상태가 같은 UPDATE에서 updated_at이 올랐다"; exit 1; }
echo "상태 같음  : updated_at 그대로 (upsert · UPDATE 둘 다)"

# INSERT에는 안 낀다. 과거 시각을 실어 넣어 그대로 남는지 본다 —
# before insert 트리거가 있으면 now()로 덮인다. 「default가 찍었나 트리거가 찍었나」는
# 값만 봐서는 구별이 안 된다(둘 다 now()다). 덮이는지로 가른다.
clear_votes
$PSQL -c "insert into attendance_votes (match_id,team_member_id,status,updated_at) values ('cccccccc-0000-0000-0000-00000000000c','bbbbbbbb-0000-0000-0000-000000000002','attend', now() - interval '3 days')" >/dev/null
[ "$($PSQL -tAc "select updated_at < now() - interval '2 days' from attendance_votes where match_id='cccccccc-0000-0000-0000-00000000000c'" | tail -1 | tr -d ' ')" = "t" ]   || { echo "!! INSERT에 트리거가 끼어들어 시각을 덮었다"; exit 1; }
clear_votes
vote c >/dev/null
[ "$($PSQL -tAc "select updated_at > now() - interval '1 minute' from attendance_votes where match_id='cccccccc-0000-0000-0000-00000000000c'" | tail -1 | tr -d ' ')" = "t" ]   || { echo "!! INSERT에서 default now()가 안 찍었다"; exit 1; }
echo "INSERT     : default now()가 찍고 트리거는 안 낌"

# ③-a 정책이 여전히 도는가. 트리거를 붙이면서 정책이 무너지는 게 이 조합의 사고다 —
# 트리거만 보고 정책을 안 보면 놓친다.
[ "$(vote a)" = "1" ] || { echo "!! 트리거를 붙이니 마감 지난 경기에 표가 들어간다"; exit 1; }
[ "$(vote d)" = "1" ] || { echo "!! 트리거를 붙이니 locked 경기에 표가 들어간다"; exit 1; }
echo "기존 조건  : ③-a 정책 여전히 돔 (마감 지남 · locked 거절)"

# 두 번 적용해도 안전한가
$PSQL < supabase/migrations/20260828_votes_updated_at_trigger.sql
clear_votes
vote c >/dev/null
t0=$(ts_of)
upsert c absent >/dev/null
gt "$(ts_of)" "$t0" || { echo "!! 두 번 적용하니 트리거가 안 돈다"; exit 1; }
echo "재실행     : 2회 적용 안전"

# 롤백 — 동작으로 본다. 뗀 뒤에는 재투표해도 안 올라야 한다(원래 동작).
$PSQL < supabase/rollback/20260828_votes_updated_at_trigger.sql
clear_votes
vote c >/dev/null
t0=$(ts_of)
upsert c absent >/dev/null
[ "$(ts_of)" = "$t0" ] || { echo "!! 롤백했는데 updated_at이 여전히 오른다"; exit 1; }
echo "롤백       : 되돌아감 (재투표해도 안 오름 = 원래 동작)"
$PSQL < supabase/migrations/20260828_votes_updated_at_trigger.sql

# ── matches 수정 정책 — with check가 없어도 새 행이 검사된다 (20260829) ──
#
# 서랍에 「matches_update_admin에 with check가 없다 — completed → open이 API로 열려
# 있다」로 적어 뒀던 항목이다. 재보니 **구멍이 아니다.** 두 가지를 여기서 동작으로 남긴다.
#
# ① Postgres는 UPDATE 정책에 with check가 없으면 **using을 with check 자리에도 쓴다.**
#    그래서 「내가 총무인 팀의 경기를 남의 팀으로 옮기기」가 이미 막혀 있다.
#    using만 있는 정책이 전부 뚫려 있다고 읽으면 안 된다 — 문서에 적힌 기본값이다.
# ② 방향(completed → open)은 정책으로는 어차피 못 막는다. with check는 새 행만,
#    using은 옛 행만 본다. 방향을 막으려면 트리거여야 한다(old·new를 같이 본다).
#    그래서 「with check를 더하면 방향이 막힌다」는 처음부터 성립하지 않았다.
#
# 항목을 지우고 이 검사대를 남긴다. 다음에 같은 진단이 또 나올 자리라, 「재봤고
# 이랬다」가 동작으로 있어야 한다.

$PSQL <<'SQL' >/dev/null
insert into teams (id,name,invite_code,created_by)
  values ('aaaaaaaa-0000-0000-0000-000000000002','남의팀','zzzz9999','22222222-2222-2222-2222-222222222222')
  on conflict (id) do nothing;
insert into team_members (id,team_id,user_id,role)
  values ('bbbbbbbb-0000-0000-0000-000000000009','aaaaaaaa-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','admin')
  on conflict (id) do nothing;
SQL

M=cccccccc-0000-0000-0000-00000000000c
as_admin() { # as_admin <SET 절>
  docker exec -i $C psql -U postgres -q -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL && echo 0 || echo 1
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
update matches set $1 where id='$M';
SQL
}
col() { $PSQL -tAc "select $1 from matches where id='$M'" | tail -1 | tr -d ' '; }

# ① 새 행이 검사된다 — with check를 안 썼는데도 팀 이동이 막힌다
[ "$(as_admin "team_id='aaaaaaaa-0000-0000-0000-000000000002'")" = "1" ] \
  || { echo "!! with check 없이 경기를 남의 팀으로 옮길 수 있다 — 기본값이 바뀌었나"; exit 1; }
[ "$(col team_id)" = "aaaaaaaa-0000-0000-0000-000000000001" ] || { echo "!! 거절됐다는데 팀이 바뀌었다"; exit 1; }
echo "새 행 검사 : using만 있어도 팀 이동이 막힌다 (Postgres가 using을 with check로 쓴다)"

# ② 정상 경로는 그대로 통과한다. 앱이 실제로 보내는 세 갈래다
[ "$(as_admin "match_date=now()+interval '3 days', location='새 구장', vote_deadline=now()+interval '2 days', quarter_minutes=12")" = "0" ] \
  || { echo "!! 경기 수정(날짜·장소·마감·쿼터)이 막힌다"; exit 1; }
[ "$(as_admin "team_count=3")" = "0" ] || { echo "!! 팀 수 변경이 막힌다"; exit 1; }
[ "$(as_admin "status='completed'")" = "0" ] || { echo "!! 경기 종료가 막힌다"; exit 1; }
[ "$(col status)" = "completed" ] || { echo "!! 종료했는데 상태가 안 바뀌었다"; exit 1; }
echo "정상 경로  : 수정 · 팀 수 · 종료 전부 통과"

# ③ 방향은 안 막힌다 — 정책으로는 못 막는 것이라 안 막았다
[ "$(as_admin "status='open'")" = "0" ] || { echo "!! completed → open이 막혔다 — 정책으로는 못 막아야 한다"; exit 1; }
[ "$(col status)" = "open" ] || { echo "!! 되돌렸는데 상태가 안 바뀌었다"; exit 1; }
echo "방향       : completed → open 통과 (정책은 old·new를 같이 못 본다 — 트리거의 일)"

# ④ 기존 조건 — 이 팀 사람이 아니면 못 건드린다
#
# 2222로 시험하면 안 된다. 앞의 D-3(위임)이 그 사람을 팀 1의 총무로 만들어 둔다 —
# 처음에 그걸로 짰다가 「남의 팀 총무가 경기를 고칠 수 있다」로 실패했고, 정책이
# 아니라 **검사대의 앞선 단계가 남긴 상태** 때문이었다.
#
# ⚠ 그리고 종료 코드로 판정하면 안 된다. **RLS가 막은 UPDATE는 오류가 아니라 0행이라
#   psql이 성공으로 끝난다.** 여기서 세 번째로 걸렸다(③-a의 마감 정책, ③-b의 트리거,
#   그리고 이것). 「거절됐다」와 「바꿀 행이 없었다」의 출력이 같으므로 **값을 본다.**
$PSQL <<'SQL' >/dev/null
insert into auth.users (id) values ('33333333-3333-3333-3333-333333333333') on conflict (id) do nothing;
SQL
before_loc="$(col location)"
docker exec -i $C psql -U postgres -q >/dev/null 2>&1 <<SQL
set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
update matches set location='남이 고침' where id='$M';
SQL
[ "$(col location)" = "$before_loc" ] || { echo "!! 팀에 없는 사람이 경기를 고쳤다"; exit 1; }
echo "기존 조건  : 팀 밖 사람은 여전히 거절 (값 그대로)"

echo

# ── 알림 설정 셋 → 넷 (20260830) ─────────────────────────────────
#
# 검사할 것은 접는 규칙이다. notify_match = new_match AND deadline인데, OR로
# 잘못 적으면 「명시적으로 끈 알림이 되살아난다」가 되고 그건 조용히 일어난다.
# 프로덕션에는 끈 사람이 없어서 실제로는 티가 안 난다 — 그래서 여기서 네 조합을
# 다 만들어 본다.
#
# ⚠ 준비 단계가 마이그레이션을 전부 부으므로 지금은 「고친 뒤」다. 롤백을 먼저
#   태워야 「고치기 전」이 된다 — 머리말의 그 규칙이다.

# 롤백 — 새 컬럼 셋을 걷어낸다
$PSQL <<'SQL' >/dev/null
alter table team_members
  drop column if exists notify_match,
  drop column if exists notify_board,
  drop column if exists notify_settlement;
SQL
$PSQL -tAc "select 1 from information_schema.columns where table_name='team_members' and column_name='notify_match'" \
  | grep -q 1 && { echo "!! 롤백이 안 됐다"; exit 1; }
echo "고치기 전  : notify_match 컬럼이 없다 (롤백 확인)"

# 네 조합을 멤버 넷으로 만든다
$PSQL <<'SQL' >/dev/null
insert into auth.users (id) values
  ('44444444-4444-4444-4444-444444444441'),
  ('44444444-4444-4444-4444-444444444442'),
  ('44444444-4444-4444-4444-444444444443'),
  ('44444444-4444-4444-4444-444444444444')
  on conflict (id) do nothing;
insert into team_members (id,team_id,user_id,role,notify_new_match,notify_deadline) values
  ('dddddddd-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444441','member', true,  true),
  ('dddddddd-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444442','member', true,  false),
  ('dddddddd-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444443','member', false, true),
  ('dddddddd-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444','member', false, false)
  on conflict (id) do nothing;
SQL

pref() { $PSQL -tAc "select notify_match from team_members where id='dddddddd-0000-0000-0000-00000000000$1'" | tail -1 | tr -d ' '; }

$PSQL < supabase/migrations/20260830_notify_prefs_v2.sql >/dev/null

# ① 접는 규칙이 AND다 — 하나라도 끈 사람은 꺼진다
[ "$(pref 1)" = "t" ] || { echo "!! 둘 다 켠 사람이 꺼졌다"; exit 1; }
[ "$(pref 2)" = "f" ] || { echo "!! deadline만 끈 사람이 켜져 있다 — OR로 접었나"; exit 1; }
[ "$(pref 3)" = "f" ] || { echo "!! new_match만 끈 사람이 켜져 있다 — OR로 접었나"; exit 1; }
[ "$(pref 4)" = "f" ] || { echo "!! 둘 다 끈 사람이 켜져 있다"; exit 1; }
echo "접는 규칙  : AND (끈 것이 되살아나지 않는다)"

# ② 새 컬럼 둘은 기본 켜짐 — 지금까지 전원에게 가던 것이라 그게 현상 유지다
for i in 1 2 3 4; do
  [ "$($PSQL -tAc "select notify_board and notify_settlement from team_members where id='dddddddd-0000-0000-0000-00000000000$i'" | tail -1 | tr -d ' ')" = "t" ] \
    || { echo "!! 새 컬럼이 기본 꺼짐이다 — 마이그레이션이 조용히 알림을 껐다"; exit 1; }
done
echo "새 컬럼    : board·settlement 기본 켜짐 (현상 유지)"

# ③ 옛 컬럼을 안 지웠다 — 읽기만 멈추고 되돌릴 여지를 남긴다
for c in notify_new_match notify_deadline; do
  $PSQL -tAc "select 1 from information_schema.columns where table_name='team_members' and column_name='$c'" \
    | grep -q 1 || { echo "!! 옛 컬럼 $c 가 사라졌다"; exit 1; }
done
echo "옛 컬럼    : 안 지웠다 (읽기만 멈춘다)"

# ④ 두 번 돌려도 같다 — 대시보드에 올리다 끊기면 다시 올리게 된다
$PSQL < supabase/migrations/20260830_notify_prefs_v2.sql >/dev/null
[ "$(pref 1)" = "t" ] && [ "$(pref 2)" = "f" ] && [ "$(pref 3)" = "f" ] && [ "$(pref 4)" = "f" ] \
  || { echo "!! 두 번째 적용에서 값이 바뀌었다"; exit 1; }
echo "재실행     : 2회 적용 안전"

# ⑤ 사람이 새 토글을 끈 뒤 다시 돌려도 그 선택이 안 뒤집힌다
$PSQL -c "update team_members set notify_match=false where id='dddddddd-0000-0000-0000-000000000001'" >/dev/null
$PSQL < supabase/migrations/20260830_notify_prefs_v2.sql >/dev/null
[ "$(pref 1)" = "f" ] || { echo "!! 사용자가 끈 새 토글이 재실행에 되살아났다"; exit 1; }
echo "사용자 선택: 끈 것을 재실행이 안 되살린다"

echo
echo "d1 ok / d2 ok / d3 ok / votes-deadline ok / votes-updated-at ok / matches-update ok / notify-prefs-v2 ok"
