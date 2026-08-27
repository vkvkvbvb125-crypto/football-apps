-- 투표 쓰기 정책에 마감 시각을 더한다.
--
-- 지금 정책은 m.status = 'open'만 본다. 그래서 「마감 시각만 지난 open 경기」가 서버에서
-- 뚫려 있다 — 앱은 attendanceStore.vote()의 가드가 막지만, 그건 클라이언트다.
-- REST를 직접 부르면 마감 뒤에도 표가 들어간다.
--
-- ⚠ null 처리가 이 마이그레이션의 전부다.
--   vote_deadline은 nullable이고 「마감을 안 정한 팀」이 그 상태다. SQL에서 null 비교는
--   unknown이라 `and m.vote_deadline >= now()`라고만 쓰면 조건 전체가 unknown이 되고
--   exists가 행을 못 찾아 **마감을 안 정한 팀이 통째로 투표를 못 하게 된다.**
--   클라이언트는 「마감 없음 = 안 지남」으로 본다(isDeadlinePassed가 vote_deadline ? … : false).
--   그 판정과 맞추려면 is null을 명시해야 한다.
--
-- 비교 기준: vote_deadline은 timestamptz이고 now()도 timestamptz다 — 같은 순간을 가리킨다.
--   클라이언트는 new Date(vote_deadline) < now 로 「지났다」를 판정하므로,
--   「안 지났다」는 vote_deadline >= now()다. 경계(정확히 마감 시각)는 양쪽 다 통과다.
--
-- 기존 두 조건(본인 표인가 · status가 open인가)은 그대로 둔다. 조건을 더하면서 기존 조건이
-- 무너지는 게 정책 변경의 흔한 사고라, 검사대에서 그 둘도 다시 본다.

drop policy if exists "votes_insert_own" on attendance_votes;
create policy "votes_insert_own" on attendance_votes for insert
  with check (
    team_member_id in (select id from team_members where user_id = auth.uid())
    and exists (
      select 1 from matches m
      where m.id = match_id
        and m.status = 'open'
        and (m.vote_deadline is null or m.vote_deadline >= now())
    )
  );

drop policy if exists "votes_update_own" on attendance_votes;
create policy "votes_update_own" on attendance_votes for update
  using (
    team_member_id in (select id from team_members where user_id = auth.uid())
    and exists (
      select 1 from matches m
      where m.id = match_id
        and m.status = 'open'
        and (m.vote_deadline is null or m.vote_deadline >= now())
    )
  );
