-- 경기 스코어 — 화면을 벗어나면 사라지던 점수를 서버에 남긴다.
--
-- 키를 (match_id, squad_label) 복합으로 잡는다.
-- 지금 UI는 A/B 두 팀뿐이지만 팀 분배는 이미 최대 5팀(A~E)까지 만든다. 컬럼을
-- score_a / score_b로 두면 3팀이 되는 순간 스키마를 바꿔야 하고, 그때는 이미 데이터가
-- 쌓여 있다. 행으로 두면 팀이 늘어도 행만 늘어난다.
--
-- squad_label은 match_assignments.group_label과 같은 값을 쓴다 — 둘이 갈리면
-- "A팀 점수"가 어느 A팀인지 알 수 없게 된다.
create table if not exists public.match_scores (
  match_id    uuid not null references public.matches(id) on delete cascade,
  squad_label text not null,
  score       int  not null default 0 check (score >= 0),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null,
  primary key (match_id, squad_label)
);

alter table public.match_scores enable row level security;

-- 읽기는 팀원 전체, 쓰기는 총무 — waitlist 정책과 같은 모양이다.
drop policy if exists match_scores_select on public.match_scores;
create policy match_scores_select on public.match_scores for select to authenticated
  using (exists (select 1 from public.matches m where m.id = match_id and is_team_member(m.team_id)));

drop policy if exists match_scores_write on public.match_scores;
create policy match_scores_write on public.match_scores for all to authenticated
  using (exists (select 1 from public.matches m where m.id = match_id and is_team_admin(m.team_id)))
  with check (exists (select 1 from public.matches m where m.id = match_id and is_team_admin(m.team_id)));
