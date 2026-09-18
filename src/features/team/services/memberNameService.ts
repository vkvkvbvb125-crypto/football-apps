// src/features/team/services/memberNameService.ts — 과거 기록에 이름을 붙이는 **유일한** 경로
//
// ── 왜 이 파일만 다른가 ────────────────────────────────────────────
// 「현재 멤버가 누구인가」와 「이 id의 이름이 무엇인가」는 **다른 질문**이다.
// 앞의 것은 나간 사람을 빼야 하고(team_members_active), 뒤의 것은 **빼면 안 된다** —
// 정산 몫·참석 투표·팀 분배는 나간 뒤에도 남고, 그 행이 가리키는 사람의 이름을
// 화면이 못 찾으면 폴백 「멤버」가 뜬다.
//
// 2026-09-18에 실제로 그렇게 깨졌다. 조회를 뷰로 돌리면서 두 질문에 **같은 목록**을
// 썼더니 정산 상세의 미납자가 「멤버」로 나왔다 — 총무가 누가 안 냈는지 알 수 없게 됐다.
// 합계(20,000원·1명 미납)는 멀쩡했다. **금액은 남고 사람이 지워진** 모양이라
// 소프트 삭제로 바꾼 이유가 절반만 지켜졌다.
//
// ⚠ **그래서 여기만 `team_members` 전체를 본다.** 다른 파일에서 같은 조회를 하면
//   `memberview.check`가 FAIL을 낸다. 이 파일도 화이트리스트일 뿐 자유가 아니다 —
//   **이름 외의 칸을 읽으면 같은 검사가 FAIL을 낸다.** 여기서 role·skill_tag를 읽기
//   시작하면 「나간 사람도 포함된 멤버 목록」이 되어, 멤버 수·권한·분배가 오염된다.
//   그게 이 파일을 만든 이유의 정반대다.
import { supabase } from '../../../lib/supabase';

/** team_members.id → 표시 이름. 나간 사람도 들어 있다 */
export type MemberNames = Map<string, string>;

/**
 * 그 팀의 **모든** 멤버 이름(나간 사람 포함).
 *
 * ⚠ 이것으로 멤버 수를 세지 마라. 나간 사람이 들어 있다 —
 *   「멤버 3명」이 되어 실제와 갈린다. 세는 것은 `fetchTeamMembers`(뷰)다.
 */
export async function fetchMemberNames(teamId: string): Promise<MemberNames> {
  /*
    ⚠ 두 번 나눠 받는다. `team_members`와 `profiles`를 조인으로 걸면 RLS가 profiles
      쪽에서 막아 **한 번도 성공하지 못한 전례**가 있다(memberProfileService 머리말).
    ⚠ id와 user_id만 받는다 — role·skill_tag를 받으면 이 파일이 멤버 목록이 된다.
  */
  const { data: rows, error } = await supabase
    .from('team_members')
    .select('id, user_id')
    .eq('team_id', teamId);
  if (error) throw error;
  if (!rows || rows.length === 0) return new Map();

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, display_name')
    /* ⚠ 한 줄로 둔다 — myscope.check가 `.in('id'` 꼴을 찾는다. 줄을 나누면 필터가
       없는 조회로 잡힌다(2026-09-18에 그렇게 걸렸다). 검사를 피하려는 게 아니라
       읽는 쪽도 이게 낫다 */
    .in('id', rows.map((r) => r.user_id));
  if (profilesError) throw profilesError;

  const nameByUserId = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  return new Map(rows.map((r) => [r.id, nameByUserId.get(r.user_id) ?? '멤버']));
}
