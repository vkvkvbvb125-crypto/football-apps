-- 연락처 · 주발
--
-- 팀이 달라져도 바뀌지 않는 값이라 profiles에 둔다.
-- (포지션·등번호·실력은 팀마다 다르므로 team_members에 있다 — 같은 사람이 팀별로 다르게 뛴다)
alter table public.profiles
  add column if not exists phone text,
  add column if not exists dominant_foot text;

-- 세 값만 허용. 화면에서도 고르게 하지만, 다른 경로로 들어온 값이 포메이션 표시를 깨지 않게 막는다.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_dominant_foot_check') then
    alter table public.profiles
      add constraint profiles_dominant_foot_check
      check (dominant_foot is null or dominant_foot in ('left', 'right', 'both'));
  end if;
end $$;
