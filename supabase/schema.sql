-- =========================================================
-- 풋살 모임 운영 앱 - Supabase 스키마 설계 (MVP)
-- 멀티테넌시: team_id 기준으로 모든 데이터 격리, RLS로 강제
-- =========================================================

-- ---------------------------------------------------------
-- 1. profiles: 카카오 로그인 사용자의 전역 프로필 (팀 무관, 1:1 with auth.users)
-- ---------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  kakao_id text unique,
  display_name text not null,
  avatar_url text,
  push_token text,
  created_at timestamptz not null default now()
);

-- auth.users에 카카오 로그인으로 신규 유저가 생기면 profiles 행을 자동 생성.
-- Supabase Kakao OAuth는 raw_user_meta_data에 name/full_name, avatar_url, provider_id(카카오 회원번호)를 채워줌.
create or replace function handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, kakao_id, display_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'provider_id',
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '멤버'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------
-- 2. teams: 테넌트 단위. 팀마다 고유 초대코드를 가짐
-- ---------------------------------------------------------
create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default substr(md5(random()::text), 1, 8),
  home_place_name text,
  home_address text,
  home_latitude double precision,
  home_longitude double precision,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- 3. team_members: 팀-사용자 매핑 + 팀 내 역할/실력태그
-- ---------------------------------------------------------
create table team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  skill_tag text check (skill_tag in ('상', '중', '하')),
  joined_at timestamptz not null default now(),
  unique (team_id, user_id)
);

-- ---------------------------------------------------------
-- 4. matches: 경기 일정
-- ---------------------------------------------------------
create table matches (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  match_date timestamptz not null,
  location text,
  address text,
  latitude double precision,
  longitude double precision,
  place_category text,
  vote_deadline timestamptz,
  status text not null default 'open' check (status in ('open', 'locked', 'completed')),
  quarter_minutes int not null default 10,
  team_count int not null default 2 check (team_count between 2 and 5),
  created_by uuid not null references team_members(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- 5. attendance_votes: 경기별 참석투표 (멤버당 1표)
-- ---------------------------------------------------------
create table attendance_votes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  team_member_id uuid not null references team_members(id) on delete cascade,
  status text not null default 'undecided' check (status in ('attend', 'absent', 'undecided')),
  updated_at timestamptz not null default now(),
  unique (match_id, team_member_id)
);

-- ---------------------------------------------------------
-- 6. settlements: 경기별 회비 정산 (총무 입력, 자동 분배 계산)
-- ---------------------------------------------------------
create table settlements (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references matches(id) on delete cascade,
  total_amount numeric(10, 0) not null,
  per_person_amount numeric(10, 0),
  bank_name text not null,
  account_number text not null,
  account_holder text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- 7. payments: 멤버별 입금 확인 체크 (총무 또는 본인이 체크 가능)
--    * 실제 이체는 처리하지 않음 - 확인 여부만 기록
-- ---------------------------------------------------------
create table payments (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references settlements(id) on delete cascade,
  team_member_id uuid not null references team_members(id) on delete cascade,
  is_paid boolean not null default false,
  checked_by uuid references team_members(id),
  checked_at timestamptz,
  unique (settlement_id, team_member_id)
);

-- ---------------------------------------------------------
-- 8. team_assignments: 경기별 팀 분배 결과
-- ---------------------------------------------------------
create table team_assignments (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  team_member_id uuid not null references team_members(id) on delete cascade,
  group_label text not null,
  updated_at timestamptz not null default now(),
  unique (match_id, team_member_id)
);

-- ---------------------------------------------------------
-- 9. notifications: 팀원별 인앱 알림 기록 (알림벨 목록/배지용, 푸시와 별도)
-- ---------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  body text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- 10. announcements: 총무가 작성하는 공지사항 (작성 시 알림 발송)
-- ---------------------------------------------------------
create table announcements (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  author_id uuid not null references team_members(id),
  title text not null,
  body text not null,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- 11. polls / poll_responses: 총무가 만드는 자유 질문 투표
-- ---------------------------------------------------------
create table polls (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  author_id uuid not null references team_members(id),
  question text not null,
  options jsonb not null,
  deadline timestamptz,
  created_at timestamptz not null default now()
);

create table poll_responses (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references polls(id) on delete cascade,
  team_member_id uuid not null references team_members(id) on delete cascade,
  option_index int not null,
  updated_at timestamptz not null default now(),
  unique (poll_id, team_member_id)
);

-- =========================================================
-- 헬퍼 함수 (security definer로 team_members 자기참조 재귀 방지)
-- =========================================================
create or replace function is_team_member(p_team_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from team_members
    where team_id = p_team_id and user_id = auth.uid()
  );
$$;

create or replace function is_team_admin(p_team_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from team_members
    where team_id = p_team_id and user_id = auth.uid() and role = 'admin'
  );
$$;

-- =========================================================
-- 팀 생성 / 초대링크 가입 RPC
-- (teams, team_members에는 직접 INSERT 정책을 두지 않고 이 함수로만 처리)
-- =========================================================
create or replace function create_team(p_name text)
returns teams
language plpgsql security definer
as $$
declare
  new_team teams;
begin
  insert into teams (name, created_by) values (p_name, auth.uid()) returning * into new_team;
  insert into team_members (team_id, user_id, role) values (new_team.id, auth.uid(), 'admin');
  return new_team;
end;
$$;

create or replace function join_team_by_invite(p_invite_code text)
returns team_members
language plpgsql security definer
as $$
declare
  target_team teams;
  new_member team_members;
begin
  select * into target_team from teams where invite_code = p_invite_code;
  if target_team is null then
    raise exception 'invalid invite code';
  end if;

  insert into team_members (team_id, user_id, role)
  values (target_team.id, auth.uid(), 'member')
  on conflict (team_id, user_id) do nothing
  returning * into new_member;

  return new_member;
end;
$$;

-- =========================================================
-- RLS 활성화 및 정책
-- =========================================================
alter table profiles enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table matches enable row level security;
alter table attendance_votes enable row level security;
alter table settlements enable row level security;
alter table payments enable row level security;
alter table team_assignments enable row level security;
alter table notifications enable row level security;
alter table announcements enable row level security;
alter table polls enable row level security;
alter table poll_responses enable row level security;

-- profiles: 본인 또는 같은 팀 소속 멤버만 조회 가능
create policy "profiles_select" on profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1 from team_members tm1
      join team_members tm2 on tm1.team_id = tm2.team_id
      where tm1.user_id = auth.uid() and tm2.user_id = profiles.id
    )
  );
create policy "profiles_insert_own" on profiles for insert with check (id = auth.uid());
create policy "profiles_update_own" on profiles for update using (id = auth.uid());

-- teams: 팀 멤버만 조회, 총무만 수정. 생성/가입은 RPC로만 처리 (INSERT 정책 없음)
create policy "teams_select" on teams for select using (is_team_member(id));
create policy "teams_update_admin" on teams for update using (is_team_admin(id));

-- team_members: 같은 팀 멤버만 조회, 총무만 수정/추방. 가입은 RPC로만 처리
create policy "team_members_select" on team_members for select using (is_team_member(team_id));
create policy "team_members_update_admin" on team_members for update using (is_team_admin(team_id));
create policy "team_members_delete_admin" on team_members for delete using (is_team_admin(team_id));

-- matches: 팀 멤버 조회, 총무만 생성/수정/삭제
create policy "matches_select" on matches for select using (is_team_member(team_id));
create policy "matches_insert_admin" on matches for insert with check (is_team_admin(team_id));
create policy "matches_update_admin" on matches for update using (is_team_admin(team_id));
create policy "matches_delete_admin" on matches for delete using (is_team_admin(team_id));

-- attendance_votes: 팀 멤버 조회, 본인 투표만 등록/수정 (마감 전 경기만)
create policy "votes_select" on attendance_votes for select
  using (exists (select 1 from matches m where m.id = match_id and is_team_member(m.team_id)));
create policy "votes_insert_own" on attendance_votes for insert
  with check (
    team_member_id in (select id from team_members where user_id = auth.uid())
    and exists (select 1 from matches m where m.id = match_id and m.status = 'open')
  );
create policy "votes_update_own" on attendance_votes for update
  using (
    team_member_id in (select id from team_members where user_id = auth.uid())
    and exists (select 1 from matches m where m.id = match_id and m.status = 'open')
  );

-- settlements: 팀 멤버 조회, 총무만 작성/수정
create policy "settlements_select" on settlements for select
  using (exists (select 1 from matches m where m.id = match_id and is_team_member(m.team_id)));
create policy "settlements_write_admin" on settlements for all
  using (exists (select 1 from matches m where m.id = match_id and is_team_admin(m.team_id)))
  with check (exists (select 1 from matches m where m.id = match_id and is_team_admin(m.team_id)));

-- payments: 팀 멤버 조회, 총무는 전원 입금확인 체크 가능, 본인은 자기 행만 체크 가능
create policy "payments_select" on payments for select
  using (exists (
    select 1 from settlements s join matches m on m.id = s.match_id
    where s.id = settlement_id and is_team_member(m.team_id)
  ));
create policy "payments_write_admin" on payments for all
  using (exists (
    select 1 from settlements s join matches m on m.id = s.match_id
    where s.id = settlement_id and is_team_admin(m.team_id)
  ))
  with check (exists (
    select 1 from settlements s join matches m on m.id = s.match_id
    where s.id = settlement_id and is_team_admin(m.team_id)
  ));
create policy "payments_write_self" on payments for update
  using (
    exists (
      select 1 from team_members tm
      where tm.id = team_member_id and tm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from team_members tm
      where tm.id = team_member_id and tm.user_id = auth.uid()
    )
  );

-- team_assignments: 팀 멤버 조회, 총무만 작성/수정
create policy "assignments_select" on team_assignments for select
  using (exists (select 1 from matches m where m.id = match_id and is_team_member(m.team_id)));
create policy "assignments_write_admin" on team_assignments for all
  using (exists (select 1 from matches m where m.id = match_id and is_team_admin(m.team_id)))
  with check (exists (select 1 from matches m where m.id = match_id and is_team_admin(m.team_id)));

-- notifications: 본인 알림만 조회/읽음처리 가능. 생성은 엣지 함수(service role)로만 처리
create policy "notifications_select_own" on notifications for select using (user_id = auth.uid());
create policy "notifications_update_own" on notifications for update using (user_id = auth.uid());

-- announcements: 팀원 조회 가능, 작성/수정/삭제는 총무만
create policy "announcements_select" on announcements for select using (is_team_member(team_id));
create policy "announcements_write_admin" on announcements for all
  using (is_team_admin(team_id))
  with check (is_team_admin(team_id));

-- polls: 팀원 조회 가능, 작성/삭제는 총무만
create policy "polls_select" on polls for select using (is_team_member(team_id));
create policy "polls_write_admin" on polls for all
  using (is_team_admin(team_id))
  with check (is_team_admin(team_id));

-- poll_responses: 팀원 조회 가능(득표 집계), 본인 응답만 작성/수정 가능
create policy "poll_responses_select" on poll_responses for select
  using (exists (select 1 from polls p where p.id = poll_id and is_team_member(p.team_id)));
create policy "poll_responses_insert_own" on poll_responses for insert
  with check (team_member_id in (select id from team_members where user_id = auth.uid()));
create policy "poll_responses_update_own" on poll_responses for update
  using (team_member_id in (select id from team_members where user_id = auth.uid()));
