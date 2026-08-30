-- 알림 설정
--
-- 사용자별 × 팀별 값이라 team_members에 둔다 — 그게 정확히 "이 사람의 이 팀 소속"이다.
-- 별도 테이블을 만들면 RLS를 한 벌 더 쓰고 조인도 늘어나는데, 얻는 게 없다.
--
-- 기본값 true: 지금까지 전원에게 보내던 동작을 그대로 유지한다.
-- 끄는 건 사용자가 명시적으로 선택해야 하고, 마이그레이션이 조용히 알림을 끄면 안 된다.
alter table public.team_members
  add column if not exists notify_new_match boolean not null default true,
  add column if not exists notify_announcement boolean not null default true,
  add column if not exists notify_deadline boolean not null default true;
