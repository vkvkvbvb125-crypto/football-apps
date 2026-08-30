-- 팀 슬로건 + 등번호
--
-- 슬로건: 팀 화면 헤더에 한 줄로 보인다. 총무만 고친다(팀 소개 문구라 팀 소유).
-- 등번호: 팀 안에서만 의미가 있어 team_members에 둔다 — 같은 사람이 팀마다 다른 번호를 쓴다.

alter table public.teams
  add column if not exists slogan text;

alter table public.team_members
  add column if not exists jersey_number smallint;

-- 0~999. 범위 밖 값은 화면에서 막지만, 다른 경로(직접 쿼리)로도 들어오지 못하게 한다.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'team_members_jersey_number_range') then
    alter table public.team_members
      add constraint team_members_jersey_number_range
      check (jersey_number is null or (jersey_number >= 0 and jersey_number <= 999));
  end if;
end $$;

-- 한 팀 안에서 번호가 겹치면 누구 번호인지 알 수 없다.
-- null은 여러 개 허용된다(아직 안 정한 사람) — 부분 유니크 인덱스라 그렇다.
create unique index if not exists team_members_jersey_unique
  on public.team_members (team_id, jersey_number)
  where jersey_number is not null;
