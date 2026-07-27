-- supabase/migrations/20260727_kickday_redesign.sql
-- 리디자인에서 UI가 요구하는 스키마 보강.
--
-- 원본 핸드오프 파일과 다른 점: 정산(settlements/payments) 섹션을 그대로 실행하면
-- 실제로는 이미 존재하는 settlements/payments 테이블 때문에 `create table if not exists`가
-- 아무것도 하지 않고 건너뛴다 — 새 컬럼(per_person, status, settlement_shares 등)이 전혀
-- 추가되지 않은 채로 새 코드가 그 컬럼들을 조회해서 바로 에러가 난다.
-- 지금까지 쌓인 정산 데이터는 전부 테스트용이라 보존할 필요가 없다고 확인했으므로,
-- 여기서는 기존 settlements/payments를 DROP하고 새 구조로 다시 만든다.
-- (RLS 정책도 테이블에 종속되므로 같이 지워지는 만큼 이 파일 끝에서 다시 만든다.)

-- ─────────────────────────────────────────────
-- 1. 경기 정원 (지금 UI는 12명 폴백을 쓰고 있음)
-- ─────────────────────────────────────────────
alter table matches
  add column if not exists capacity int not null default 12;

comment on column matches.capacity is '정원. 초과 참석 투표는 대기자로 처리된다.';

-- ─────────────────────────────────────────────
-- 2. 구장 / 예약 슬롯 (경기 만들기 시트의 제휴구장 목록)
-- ─────────────────────────────────────────────
create table if not exists venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  latitude double precision,
  longitude double precision,
  is_indoor boolean not null default false,
  is_partner boolean not null default false,
  hourly_price int,
  max_players int,
  -- UI 태그: '주차 가능', '샤워실', '풋살화 대여' 등
  amenities text[] not null default '{}',
  -- "킥데이 팀 N곳 이용" 표기용 (배치로 갱신하거나 view로 계산)
  used_by_teams int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists venues_partner_idx on venues (is_partner) where is_partner;
create index if not exists venues_geo_idx on venues (latitude, longitude);

create table if not exists venue_slots (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues (id) on delete cascade,
  slot_date date not null,
  start_time time not null,
  end_time time not null,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  unique (venue_id, slot_date, start_time)
);

create index if not exists venue_slots_lookup_idx on venue_slots (venue_id, slot_date);

-- 경기 ↔ 구장 연결 (기존 location은 비제휴 수동입력용으로 유지)
alter table matches
  add column if not exists venue_id uuid references venues (id) on delete set null,
  add column if not exists location_pending boolean not null default false;

comment on column matches.location_pending is '장소 미정으로 투표만 먼저 시작한 경기';

-- ─────────────────────────────────────────────
-- 3. 멤버 프로필 (명단 시트 / 팀 분배)
-- ─────────────────────────────────────────────
alter table team_members
  add column if not exists position text,
  -- 총무가 정하는 실력 레벨: 3 상 / 2 중 / 1 하
  add column if not exists skill_level smallint not null default 2
    check (skill_level between 1 and 3);

comment on column team_members.skill_level is '총무 설정. 팀 분배 균형 계산에 사용 (3 상 / 2 중 / 1 하)';

-- 참석률은 저장하지 않고 뷰로 계산 (투표가 바뀌면 자동 반영)
-- security_invoker: 뷰를 조회하는 사람 권한으로 실행되게 해서 team_members의 RLS를 그대로 따르게 한다.
create or replace view team_member_stats
  with (security_invoker = true)
as
select
  tm.id as team_member_id,
  tm.team_id,
  count(v.id) filter (where v.status = 'attend') as attend_count,
  count(v.id) as vote_count,
  case
    when count(v.id) = 0 then null
    else round(
      100.0 * count(v.id) filter (where v.status = 'attend') / count(v.id)
    )::int
  end as attendance_rate
from team_members tm
left join attendance_votes v on v.team_member_id = tm.id
group by tm.id, tm.team_id;

-- ─────────────────────────────────────────────
-- 4. 대기자
-- ─────────────────────────────────────────────
create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  team_member_id uuid not null references team_members (id) on delete cascade,
  position int not null,
  created_at timestamptz not null default now(),
  unique (match_id, team_member_id)
);

create index if not exists waitlist_match_idx on waitlist (match_id, position);

-- ─────────────────────────────────────────────
-- 5. 팀 설정 (정기모임 기본값 / 회비 / 게스트 / 가입 승인)
-- ─────────────────────────────────────────────
create table if not exists team_settings (
  team_id uuid primary key references teams (id) on delete cascade,
  -- 정기모임: 0=월 … 6=일, 복수 요일 허용
  default_weekdays smallint[] not null default '{}',
  default_time time,
  default_venue_id uuid references venues (id) on delete set null,
  default_capacity int not null default 12,
  -- 회비: 'per_match' | 'monthly'
  fee_mode text not null default 'per_match' check (fee_mode in ('per_match', 'monthly')),
  default_fee int,
  bank_name text,
  account_no text,
  account_holder text,
  guest_allowed boolean not null default true,
  guest_fee int,
  join_approval_required boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────
-- 6. 정산 — 기존 settlements/payments를 새 구조로 교체
--    (확인됨: 지금까지의 정산 데이터는 테스트용이라 보존 불필요)
-- ─────────────────────────────────────────────
drop table if exists payments;
drop table if exists settlements;

create table settlements (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  total_amount int not null,
  per_person int not null,
  -- 10원 올림으로 더 모인 금액
  surplus int not null default 0,
  memo text,
  bank_name text,
  account_no text,
  account_holder text,
  status text not null default 'open' check (status in ('open', 'done', 'skipped')),
  created_by uuid references team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (match_id)
);

create table settlement_shares (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references settlements (id) on delete cascade,
  team_member_id uuid references team_members (id) on delete cascade,
  -- 게스트는 team_member가 없으므로 이름만
  guest_name text,
  amount int not null,
  exempt boolean not null default false,
  -- 멤버가 "입금했어요"를 누른 시각
  marked_paid_at timestamptz,
  -- 총무가 확인한 시각
  confirmed_at timestamptz,
  unique (settlement_id, team_member_id),
  check (team_member_id is not null or guest_name is not null)
);

create index if not exists settlement_shares_lookup_idx
  on settlement_shares (settlement_id, confirmed_at);

-- ─────────────────────────────────────────────
-- 7. RLS — 새로 만든 테이블 전부에 대해 설정
--    (venues/venue_slots는 팀 소속과 무관한 공용 데이터라 조회만 열어둔다.
--     팀 분배 화면에서 아직 실제로 쓰이지 않으므로 쓰기 정책은 나중에 필요할 때 추가한다.)
-- ─────────────────────────────────────────────
alter table venues enable row level security;
alter table venue_slots enable row level security;
alter table waitlist enable row level security;
alter table team_settings enable row level security;
alter table settlements enable row level security;
alter table settlement_shares enable row level security;

create policy "venues_select_authenticated" on venues for select
  using (auth.uid() is not null);
create policy "venue_slots_select_authenticated" on venue_slots for select
  using (auth.uid() is not null);

create policy "waitlist_select" on waitlist for select
  using (exists (select 1 from matches m where m.id = match_id and is_team_member(m.team_id)));
create policy "waitlist_write_admin" on waitlist for all
  using (exists (select 1 from matches m where m.id = match_id and is_team_admin(m.team_id)))
  with check (exists (select 1 from matches m where m.id = match_id and is_team_admin(m.team_id)));

create policy "team_settings_select" on team_settings for select
  using (is_team_member(team_id));
create policy "team_settings_write_admin" on team_settings for all
  using (is_team_admin(team_id))
  with check (is_team_admin(team_id));

-- settlements: 팀 멤버 조회, 총무만 작성/수정 (team_id를 직접 갖고 있어 join 없이 바로 체크)
create policy "settlements_select" on settlements for select
  using (is_team_member(team_id));
create policy "settlements_write_admin" on settlements for all
  using (is_team_admin(team_id))
  with check (is_team_admin(team_id));

-- settlement_shares: 팀 멤버 조회, 총무는 전원 쓰기 가능, 본인은 자기 행만 쓰기 가능
create policy "settlement_shares_select" on settlement_shares for select
  using (exists (
    select 1 from settlements s where s.id = settlement_id and is_team_member(s.team_id)
  ));
create policy "settlement_shares_write_admin" on settlement_shares for all
  using (exists (
    select 1 from settlements s where s.id = settlement_id and is_team_admin(s.team_id)
  ))
  with check (exists (
    select 1 from settlements s where s.id = settlement_id and is_team_admin(s.team_id)
  ));
create policy "settlement_shares_write_self" on settlement_shares for update
  using (
    exists (select 1 from team_members tm where tm.id = team_member_id and tm.user_id = auth.uid())
  )
  with check (
    exists (select 1 from team_members tm where tm.id = team_member_id and tm.user_id = auth.uid())
  );
