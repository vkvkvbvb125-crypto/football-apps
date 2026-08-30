-- 팀 게시판 — 자유게시판 / 경기 후기 / 질문·요청
--
-- 공지(announcements)와 나눈 이유: 공지는 총무가 쓰고 모두가 읽는 일방향 알림이고,
-- 게시판은 아무나 쓰고 서로 답하는 곳이다. 읽음 처리·알림·권한이 전부 달라서 한 테이블에 못 넣는다.
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'free' check (category in ('free', 'review', 'question')),
  body text not null,
  image_url text,
  created_at timestamptz not null default now()
);

create index if not exists posts_team_created_idx on public.posts (team_id, created_at desc);

-- 좋아요는 사람당 한 번 — PK로 막는다(앱에서 두 번 눌러도 두 개가 안 생긴다)
create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);

alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;

-- 우리 팀 글만 보이고, 우리 팀에만 쓸 수 있다.
-- 지우는 건 글쓴이 본인 또는 총무 (총무는 부적절한 글을 치울 수 있어야 한다).
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts for select to authenticated
  using (exists (select 1 from public.team_members tm where tm.team_id = posts.team_id and tm.user_id = auth.uid()));

drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.team_members tm where tm.team_id = posts.team_id and tm.user_id = auth.uid())
  );

drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts for update to authenticated using (author_id = auth.uid());

drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.team_members tm
      where tm.team_id = posts.team_id and tm.user_id = auth.uid() and tm.role = 'admin'
    )
  );

drop policy if exists post_likes_select on public.post_likes;
create policy post_likes_select on public.post_likes for select to authenticated
  using (exists (
    select 1 from public.posts p join public.team_members tm on tm.team_id = p.team_id
    where p.id = post_likes.post_id and tm.user_id = auth.uid()
  ));

drop policy if exists post_likes_write_own on public.post_likes;
create policy post_likes_write_own on public.post_likes for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists post_likes_delete_own on public.post_likes;
create policy post_likes_delete_own on public.post_likes for delete to authenticated using (user_id = auth.uid());

drop policy if exists post_comments_select on public.post_comments;
create policy post_comments_select on public.post_comments for select to authenticated
  using (exists (
    select 1 from public.posts p join public.team_members tm on tm.team_id = p.team_id
    where p.id = post_comments.post_id and tm.user_id = auth.uid()
  ));

drop policy if exists post_comments_insert on public.post_comments;
create policy post_comments_insert on public.post_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.posts p join public.team_members tm on tm.team_id = p.team_id
      where p.id = post_comments.post_id and tm.user_id = auth.uid()
    )
  );

drop policy if exists post_comments_delete on public.post_comments;
create policy post_comments_delete on public.post_comments for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1 from public.posts p join public.team_members tm on tm.team_id = p.team_id
      where p.id = post_comments.post_id and tm.user_id = auth.uid() and tm.role = 'admin'
    )
  );
