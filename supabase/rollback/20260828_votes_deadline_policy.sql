-- 20260828_votes_deadline_policy.sql 되돌리기.
--
-- 정책을 schema.sql:302-311의 원래 정의로 되돌린다. 정책은 상태가 없어서 완전히
-- 되돌아간다 — 되돌린 뒤에는 「마감 시각만 지난 open 경기」가 다시 뚫린다.
-- 검사대는 그것을 **동작으로** 확인한다(메타데이터가 아니라 실제 insert가 되는지).
--
-- 되돌리면 그 구멍이 다시 열린다는 것이 이 파일의 유일한 부작용이다.
-- 데이터는 건드리지 않는다.

drop policy if exists "votes_insert_own" on attendance_votes;
create policy "votes_insert_own" on attendance_votes for insert
  with check (
    team_member_id in (select id from team_members where user_id = auth.uid())
    and exists (select 1 from matches m where m.id = match_id and m.status = 'open')
  );

drop policy if exists "votes_update_own" on attendance_votes;
create policy "votes_update_own" on attendance_votes for update
  using (
    team_member_id in (select id from team_members where user_id = auth.uid())
    and exists (select 1 from matches m where m.id = match_id and m.status = 'open')
  );
