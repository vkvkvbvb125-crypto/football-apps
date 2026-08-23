-- 팀 프로필 필드 — 활동 지역 · 정기 일정 · 평균 인원 · 실력.
--
-- 목적은 「매칭을 열 때 데이터가 이미 쌓여 있게」 하는 것까지다. 지금 검증에 들어오는
-- 팀들이 프로필을 채워두면, 나중에 팀 대 팀 매칭을 붙일 때 기존 팀에 다시 요청하지
-- 않아도 된다. 매칭 기능 자체는 만들지 않는다 — 같은 지역에 20~30팀이 있어야 작동한다.
--
-- 정기 일정(요일·시간)도 만들지 않았다. team_settings.default_weekdays/default_time이
-- 이미 있고 그쪽이 더 정확한 모델이다 — 배열이라 「매주 화·목」을 표현할 수 있다.
-- teams에 단일 int로 또 두면 같은 뜻의 저장소가 둘이 되고, 총무가 두 곳에 같은 걸
-- 입력하게 된다. B-3 표시 줄은 team_settings를 읽는다.
--
-- home_venue는 만들지 않았다. teams.home_place_name이 이미 같은 뜻이고 좌표
-- (home_latitude/longitude)까지 딸려 있다. 같은 뜻의 컬럼이 둘이면 다음에 어느 쪽이
-- 진짜인지 알 수 없게 된다.
alter table public.teams
  add column if not exists region_code     text,
  add column if not exists region_label    text,
  add column if not exists avg_headcount   int,
  add column if not exists skill_level     text,
  add column if not exists open_to_match   boolean not null default false;

-- CHECK로 막는다. team_members.skill_tag, matches.match_type, team_members.role이
-- 모두 같은 패턴이라 여기만 앱 검증이면 일관성이 깨지고, 스크립트나 대시보드로
-- 직접 넣을 때 오타가 그대로 들어간다.
-- 값을 늘릴 때는 20260806(match_type)처럼 drop 후 재생성한다.
alter table public.teams drop constraint if exists teams_skill_level_check;
alter table public.teams
  add constraint teams_skill_level_check
  check (skill_level is null or skill_level in ('beginner', 'intermediate', 'advanced'));

alter table public.teams drop constraint if exists teams_avg_headcount_check;
alter table public.teams
  add constraint teams_avg_headcount_check
  check (avg_headcount is null or avg_headcount between 1 and 99);

-- open_to_match는 컬럼만 만든다. UI에 노출하지 않는다 — 켜도 상대가 없다.
comment on column public.teams.open_to_match is '매칭 공개 여부. 매칭 기능을 붙일 때까지 UI 없음';
