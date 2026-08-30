-- 20260812_announcement_reads.sql
-- 공지를 누가 읽었는지 기록한다. 총무가 "5명 읽음"을 보려면 이 표가 있어야 한다.
--
-- 왜 알림(notifications)의 is_read를 못 쓰나:
-- 공지를 올리면 팀원에게 알림이 같이 가지만, 그 알림 행에는 어느 공지에서 나온 것인지가
-- 남지 않는다(title/body 텍스트뿐). 제목으로 짝을 맞추면 제목을 고치는 순간 끊긴다.
-- 또 알림은 발송 시점의 팀원에게만 생기므로, 나중에 들어온 사람은 영영 집계에 안 잡힌다.

create table if not exists announcement_reads (
  announcement_id uuid not null references announcements (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  read_at timestamptz not null default now(),
  -- 같은 사람이 여러 번 읽어도 한 줄이다
  primary key (announcement_id, user_id)
);

create index if not exists announcement_reads_lookup_idx on announcement_reads (announcement_id);

alter table announcement_reads enable row level security;

-- 읽음 기록은 본인만 남긴다. 남이 읽은 것처럼 꾸밀 수 없다.
create policy "announcement_reads_insert_own" on announcement_reads for insert
  with check (user_id = auth.uid());

-- 집계는 팀 멤버가 볼 수 있다 — 총무가 "몇 명 읽음"을 세려면 남의 행도 읽어야 한다.
-- 팀 밖으로는 새지 않는다(공지가 속한 팀의 멤버만).
create policy "announcement_reads_select_team" on announcement_reads for select
  using (exists (
    select 1 from announcements a where a.id = announcement_id and is_team_member(a.team_id)
  ));

-- 읽음을 취소하는 기능은 없다 — 지우는 정책도 두지 않는다.

comment on table announcement_reads is '공지 읽음 기록. 작성자 본인은 넣지 않는다(자기 공지를 읽었다고 세면 집계가 부풀려진다).';
