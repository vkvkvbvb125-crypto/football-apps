-- 계정 삭제 (D-5 준비) — 인증 없이 부르면 열리던 것을 닫는다
--
-- account_deletion_status()는 auth.uid()가 null이면 me가 비고, 그러면 미납 0건 ·
-- 관리하는 팀 0개가 되어 can_delete가 참으로 나왔다. 판정이 헛돌면 「삭제해도 된다」가
-- 나오는 구조였다 — fail-open이다.
--
-- 실제로 이렇게 된다: Edge Function이 PostgREST를 부를 때 apikey를 service_role로 보내면
-- 그 요청은 사용자가 아니라 서비스 역할로 평가되고 auth.uid()가 null이 된다.
-- 호출자 쪽 실수 하나가 곧바로 「전원 삭제 가능」이 되는 것이다.
--
-- 호출자마다 조심하게 하는 대신 함수에서 닫는다. 부르는 곳이 늘어도 같은 실수가 안 난다.
--
-- uid를 돌려주는 것도 같은 이유다. 호출자가 「내가 검증한 사용자」와 「함수가 판정한
-- 사용자」가 같은지 대조할 수 있어야, 토큰이 바뀌어 들어간 경우를 잡는다.
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
  select case
    when auth.uid() is null then
      jsonb_build_object('can_delete', false, 'reason', 'no_auth', 'uid', null)
    else
      jsonb_build_object(
        'uid',         auth.uid(),
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
      )
  end;
$$;

revoke all on function public.account_deletion_status() from public;
grant execute on function public.account_deletion_status() to authenticated;
