-- 계정 삭제 (D-2) — 삭제 전에 무엇이 걸리는지 알려주는 함수
--
-- 삭제를 실제로 막는 곳은 Edge Function(D-5)이지만, 판단은 여기서 한다.
-- 화면(D-6)도 같은 함수를 불러 「왜 안 되는지」를 누르기 전에 보여준다 —
-- 판단이 두 곳에 있으면 화면은 된다고 하고 서버는 거절하는 상태가 생긴다.
--
-- 인자가 없고 auth.uid()만 쓴다. 대상을 인자로 받으면 남의 미납 건수를 물어볼 수 있다.
--
-- ── unpaid_own: 삭제를 막는 유일한 조건 ──
-- 「내가 안 낸 것」만 센다. 팀의 미납 전체를 조건에 넣으면 총무는 사실상 탈퇴를 못 한다 —
-- 매주 경기가 돌고 정산이 붙는 동호회에서 미납이 0인 순간은 거의 없다. 남이 안 낸 것은
-- 총무의 채무가 아니고, 계정 삭제를 사실상 봉쇄하는 조건은 App Store 심사 지침
-- 5.1.1(v)에서도 위험하다.
--
-- marked_paid_at이 있으면 미납으로 안 센다. confirmed_at(총무 확인)까지 요구하면
-- 「내가 보냈는데 총무가 아직 안 눌러서」 탈퇴가 막힌다 — 그것도 남의 행동에 걸리는 것이다.
-- 본인이 할 수 있는 일을 다 했으면 통과시킨다.
--
-- status='open'인 정산만 본다. done은 총무가 마감한 것이고 skipped는 건너뛴 것이라,
-- 거기 남은 미납은 이미 팀이 정리를 끝낸 뒤의 기록이다.
--
-- ── admin_teams: 막지 않는다. 위임 화면(D-3)이 읽는 안내용이다 ──
-- unpaid_team은 반대로 marked_paid_at을 빼지 않는다. 이건 「내가 낼 것」이 아니라
-- 「총무가 아직 확인 못 한 건수」라서, 신고만 되고 확인이 안 된 것도 인수인계 대상이다.
create or replace function public.account_deletion_status()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with me as (
    select tm.id, tm.team_id, tm.role
      from team_members tm
     where tm.user_id = auth.uid()
  )
  select jsonb_build_object(
    'unpaid_own', (
      select count(*)
        from settlement_shares ss
        join settlements s on s.id = ss.settlement_id
       where ss.team_member_id in (select id from me)
         and s.status = 'open'
         and not ss.exempt
         and ss.confirmed_at is null
         and ss.marked_paid_at is null
    ),
    'admin_teams', coalesce((
      select jsonb_agg(jsonb_build_object(
               'team_id',      t.id,
               'team_name',    t.name,
               'members',      (select count(*) from team_members x where x.team_id = t.id),
               'other_admins', (select count(*) from team_members x
                                 where x.team_id = t.id and x.role = 'admin' and x.user_id <> auth.uid()),
               'unpaid_team',  (select count(*) from settlement_shares ss
                                  join settlements s on s.id = ss.settlement_id
                                 where s.team_id = t.id and s.status = 'open'
                                   and not ss.exempt and ss.confirmed_at is null)
             ) order by t.name)
        from teams t
       where t.id in (select team_id from me where role = 'admin')
    ), '[]'::jsonb)
  );
$$;

-- 인자가 없어도 public에 열어 두면 익명 호출이 auth.uid() = null로 도는 것을 허용하게 된다.
-- 결과가 0/빈 배열이라 새는 건 없지만, 열어 둘 이유도 없다.
revoke all on function public.account_deletion_status() from public;
grant execute on function public.account_deletion_status() to authenticated;
