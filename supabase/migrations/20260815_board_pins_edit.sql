-- 게시판 — 글 고정(총무만)과 수정 표시
--
-- 고정을 posts.is_pinned 컬럼으로 두지 않은 이유: 총무가 고정하려면 posts에 update 권한이
-- 필요한데, RLS는 컬럼 단위로 못 막아서 총무가 남의 글 본문까지 고칠 수 있게 된다.
-- 테이블을 나누면 "총무는 고정만"이 데이터 모델로 보장되고 트리거가 필요 없다.
create table if not exists public.post_pins (
  post_id uuid primary key references public.posts(id) on delete cascade,
  pinned_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- null이면 한 번도 안 고친 글이다.
-- created_at과 비교하는 방식은 초 단위 오차로 갓 쓴 글이 "수정됨"이 된다.
alter table public.posts add column if not exists updated_at timestamptz;

alter table public.post_pins enable row level security;

-- 읽기는 그 팀 팀원 전부
drop policy if exists post_pins_select on public.post_pins;
create policy post_pins_select on public.post_pins for select to authenticated
  using (exists (
    select 1 from public.posts p join public.team_members tm on tm.team_id = p.team_id
    where p.id = post_pins.post_id and tm.user_id = auth.uid()
  ));

-- 고정/해제는 그 팀 총무만
drop policy if exists post_pins_insert on public.post_pins;
create policy post_pins_insert on public.post_pins for insert to authenticated
  with check (
    pinned_by = auth.uid()
    and exists (
      select 1 from public.posts p join public.team_members tm on tm.team_id = p.team_id
      where p.id = post_pins.post_id and tm.user_id = auth.uid() and tm.role = 'admin'
    )
  );

drop policy if exists post_pins_delete on public.post_pins;
create policy post_pins_delete on public.post_pins for delete to authenticated
  using (exists (
    select 1 from public.posts p join public.team_members tm on tm.team_id = p.team_id
    where p.id = post_pins.post_id and tm.user_id = auth.uid() and tm.role = 'admin'
  ));
