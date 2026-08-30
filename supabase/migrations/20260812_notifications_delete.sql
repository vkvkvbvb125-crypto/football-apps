-- 20260812_notifications_delete.sql
-- 알림 목록에서 개별 삭제(밀어서 삭제)를 쓰려면 본인 알림을 지울 권한이 있어야 한다.
--
-- 지금까지 알림은 읽음 처리(update)만 했고 삭제 정책이 없었다. RLS가 켜져 있으면
-- 정책 없는 동작은 조용히 0건 처리된다 — 앱에서는 지운 것처럼 보이다가 새로고침하면
-- 되살아난다. 그래서 화면보다 이 정책이 먼저다.
--
-- 본인 것만 지운다. 남의 알림은 물론이고 총무도 팀원 알림을 지울 수 없다.

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notifications' and policyname = 'notifications_delete_own'
  ) then
    create policy "notifications_delete_own" on notifications for delete
      using (user_id = auth.uid());
  end if;
end $$;
