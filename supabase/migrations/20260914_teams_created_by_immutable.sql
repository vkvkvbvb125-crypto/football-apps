-- 20260914_teams_created_by_immutable.sql
-- teams.created_by를 아무도 못 바꾸게 잠근다.
--
-- ── ⚠ 지금은 아무것도 안 바뀐다 ──────────────────────────────────
-- created_by를 **읽는 코드가 한 줄도 없다.** 이 저장소는 「만들어 두고 안 쓰는」 것을
-- 여러 번 잡았으므로, 이번엔 그게 의도라는 것을 여기 적는다.
--
-- **언제 쓸 것인가:** 총무가 둘인 팀이 실제로 생기고, 총무끼리 서로 내보낼 수 있는
-- 것이 문제가 될 때. 지금 RLS는 is_team_admin만 보므로 **모든 총무가 같고**,
-- 누가 먼저인지를 DB가 모르면 무엇을 근거로 막을지 정할 수 없다.
-- 그때 판단 근거가 되려면 그 값이 **믿을 수 있어야** 한다 — 이 파일이 하는 일이다.
--
-- ── ⚠ 컬럼은 이미 있고 이미 채워진다 ────────────────────────────
-- create_team RPC가 처음부터 넣고 있었다:
--     insert into teams (name, created_by) values (p_name, auth.uid())
-- 그 함수는 security definer라 RLS를 우회하고, teams·team_members에는 insert 정책이
-- 아예 없어서 **팀 생성은 이 함수로만 된다.** 여기서 더하는 것은 값이 아니라
-- **값의 신뢰성**이다.
--
-- ── 무엇이 뚫려 있었나 ──────────────────────────────────────────
--     create policy "teams_update_admin" on teams for update using (is_team_admin(id));
-- `using`만 있고 `with check`가 없다. using은 「이 행을 수정할 수 있는가」만 보고
-- **바뀐 결과는 안 본다.** 그래서 아무 총무나 created_by를 자기 id로 바꿀 수 있었다 —
-- 앱은 그런 요청을 안 보내지만 API로는 한 줄이다.
-- 그 위에 권한을 세우면 최종 결정권자가 「먼저 손댄 사람」이 되고,
-- 막으려던 상호 축출이 더 조용한 형태로 돌아온다.
--
-- ── ⚠ 기존 팀을 추측으로 채우지 않는다 ──────────────────────────
-- 생성자가 계정을 지우면 created_by는 null이 된다
-- (20260824_account_deletion_fks의 on delete set null).
-- null이 「알 수 없다」를 정직하게 담는다 — joined_at 최솟값으로 채우면
-- 「가장 오래 있은 사람」이지 「만든 사람」이 아니고, 그 추측 위에 권한을 세우면
-- 틀린 사람이 최종 결정권을 갖는다.

-- ── 1) 정책: 총무만 수정하고, 수정 결과도 여전히 자기 팀이어야 한다 ──
--
-- ⚠ **여기서 created_by의 불변을 확인하려 하지 않는다.** with check 안에서
--   「옛 값과 같은가」를 서브쿼리로 보려면 그 서브쿼리가 갱신 **전** 행을 보는지
--   **후** 행을 보는지에 기대야 한다. 그건 「정책 한 줄로 막았다」고 믿기 어려운
--   자리다. 옛 값과 새 값을 비교하는 일은 트리거가 깨끗하게 한다(아래 2번).
--   정책은 정책이 잘하는 일만 한다 — 「이 사람이 이 팀의 총무인가」.
drop policy if exists "teams_update_admin" on public.teams;

create policy "teams_update_admin" on public.teams for update
  using (is_team_admin(id))
  with check (is_team_admin(id));

-- ── 2) 트리거: created_by는 한 번 정해지면 안 바뀐다 ──────────────
--
-- ⚠ `is distinct from`을 쓴다. `<>`는 한쪽이 null이면 null을 내고, null은 참이 아니라서
--   **조용히 통과한다.** 생성자가 탈퇴해 null이 된 팀에서 누가 값을 넣는 것을
--   못 막게 된다 — null 비교는 SQL에서 조용히 틀리기 쉬운 자리라 명시적으로 쓴다.
-- ⚠ update에만 건다. insert에 걸면 create_team이 막힌다.
-- ⚠ security definer 함수도 트리거는 지난다. create_team은 insert라 안 걸린다.
create or replace function public.teams_created_by_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.created_by is not distinct from old.created_by then
    return new;
  end if;

  /*
    ⚠ **탈퇴가 미는 null은 허용한다. 검사대가 잡아 준 자리다.**

    20260824_account_deletion_fks가 teams.created_by를 `on delete set null`로 만들었다.
    계정을 지우면 Postgres가 `update teams set created_by = null`을 스스로 돌리는데,
    처음 판(어떤 변경이든 막음)은 **그걸 막아서 계정 탈퇴 자체가 실패했다.**
    「불변」을 글자 그대로 구현하면 시스템이 자기 일을 못 하게 된다.

    ⚠ 그렇다고 null로 미는 것을 아무에게나 열면 안 된다 — 총무가 창립자 기록을
      지워버릴 수 있다. **그 사람이 실제로 사라졌을 때만** 허용한다.
      검사대에서 확인했다 — 「고친 뒤: 삭제 통과」.
      ⚠ 추측을 두 번 하고서야 값을 찍어 봤다. 처음엔 「창립자가 auth.users에 아직
        있는가」로 가르려 했는데 안 통했다 — FK 동작이 같은 명령의 스냅샷에서 돌아
        그 시점에도 지워진 행이 보인다. 「지워진 뒤에 돈다」는 맞지만
        「그래서 안 보인다」는 틀렸다.

      가르는 것은 **pg_trigger_depth()**다. 사람이 보낸 update는 깊이 1에서 돌고,
      FK의 set null은 **참조 무결성 트리거가 일으킨 update**라 깊이 2 이상에서 돈다.

      ⚠ 처음엔 「창립자가 auth.users에 아직 있는가」로 가르려 했다. **안 통했다** —
        FK 동작이 같은 명령의 스냅샷에서 돌아서, 그 시점에도 지워진 행이 아직 보인다.
        검사대가 잡아 줬다. 「지워진 뒤에 돈다」는 맞지만 「그래서 안 보인다」는 틀렸다.
  */
  if old.created_by is not null
     and new.created_by is null
     and pg_trigger_depth() > 1 then
    return new;
  end if;

  raise exception 'teams.created_by는 바꿀 수 없습니다';
end;
$$;

drop trigger if exists teams_created_by_immutable on public.teams;

create trigger teams_created_by_immutable
  before update on public.teams
  for each row execute function public.teams_created_by_immutable();

-- ── 확인용 조회 ──────────────────────────────────────────────────
-- null은 「생성자가 탈퇴함」이다. 추측으로 채우지 않는다.
--   select id, name, created_by is null as creator_unknown, created_at
--   from public.teams order by created_at;
