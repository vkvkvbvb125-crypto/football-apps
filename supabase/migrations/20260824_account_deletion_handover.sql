-- 계정 삭제 (D-3) — 위임 강제와 최종 판정
--
-- 약관 제4조 ④가 「총무가 탈퇴하는 경우, 팀이 유지되려면 다른 팀원에게 총무 권한을
-- 넘겨야 합니다」라고 이미 선언했다. 자동 승계로 만들면 문서와 코드가 갈린다.
--
-- 위임 자체를 새로 만들지 않는다. MemberListModal의 「총무 임명」이 정확히 그 동작이고
-- (role='admin'은 하나뿐이라 총무와 부총무가 따로 없다), 이미 총무에게만 보인다.
-- 여기서 하는 건 넘기지 않은 채로 나가려 할 때 거절하는 것뿐이다.
--
-- 위임을 삭제 흐름 안에 끼우지 않는 이유: 중간에 취소하면 「위임은 됐는데 삭제는 안 된」
-- 상태가 남는다. 되돌릴 수 없는 두 가지를 한 화면에 묶지 않는다. 총무 교체는 휴가·이사처럼
-- 탈퇴와 무관하게도 필요해서, 탈퇴 흐름에만 두면 그때까지 못 넘긴다.
--
-- needs_handover는 「나 말고 총무가 없고, 내가 나가도 남는 멤버가 있을 때」다.
-- 혼자인 팀은 넘길 상대가 없으므로 막지 않는다 — 멤버가 0이 되면 teams_select가
-- is_team_member(id)라서 그 팀은 아무에게도 안 보인다. 팀을 지우거나 감추는 코드가
-- 따로 필요 없는 이유다(D-4).
--
-- can_delete를 여기서 계산한다. Edge Function(D-5)과 화면(D-6)이 각자 규칙을 다시
-- 쓰면 언젠가 갈린다 — 화면은 된다고 하고 서버는 거절하는 상태가 그것이다.
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
  ),
  unpaid as (
    -- 「내가 안 낸 것」만. 팀 전체 미납을 넣으면 총무는 사실상 탈퇴를 못 한다.
    -- marked_paid_at이 있으면 본인이 할 일은 끝난 것이라 세지 않는다.
    select count(*) as n
      from settlement_shares ss
      join settlements s on s.id = ss.settlement_id
     where ss.team_member_id in (select id from me)
       and s.status = 'open'
       and not ss.exempt
       and ss.confirmed_at is null
       and ss.marked_paid_at is null
  ),
  admin_teams as (
    select t.id, t.name,
           (select count(*) from team_members x where x.team_id = t.id) as members,
           (select count(*) from team_members x
             where x.team_id = t.id and x.role = 'admin' and x.user_id <> auth.uid()) as other_admins,
           -- 안내용. 여기는 marked_paid_at을 빼지 않는다 — 「내가 낼 것」이 아니라
           -- 「총무가 아직 확인 못 한 건수」라서 신고만 된 것도 인수인계 대상이다.
           (select count(*) from settlement_shares ss
              join settlements s on s.id = ss.settlement_id
             where s.team_id = t.id and s.status = 'open'
               and not ss.exempt and ss.confirmed_at is null) as unpaid_team
      from teams t
     where t.id in (select team_id from me where role = 'admin')
  ),
  scored as (
    select *, (other_admins = 0 and members > 1) as needs_handover from admin_teams
  )
  select jsonb_build_object(
    'can_delete',  (select n from unpaid) = 0
                   and not exists (select 1 from scored where needs_handover),
    'unpaid_own',  (select n from unpaid),
    'admin_teams', coalesce((
      select jsonb_agg(jsonb_build_object(
               'team_id',        id,
               'team_name',      name,
               'members',        members,
               'other_admins',   other_admins,
               'unpaid_team',    unpaid_team,
               'needs_handover', needs_handover
             ) order by name)
        from scored
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.account_deletion_status() from public;
grant execute on function public.account_deletion_status() to authenticated;
