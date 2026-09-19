// src/features/attendance/utils/voting.ts
// 투표가 열려 있는지 판정 — 홈/일정이 같은 답을 내야 한다.
//
// 예전엔 일정 화면에만 이 판정이 있어서, 홈에서는 마감된 경기에도 투표 버튼이 눌렸다.
// 같은 규칙을 두 벌 두면 반드시 한쪽만 고쳐지는 날이 온다.
import type { MatchStatus } from '../../../types/database';

interface VotableMatch {
  status: MatchStatus;
  vote_deadline: string | null;
}

/** 마감 시각이 지났는지 (마감이 없으면 지나지 않은 것으로 본다) */
export function isDeadlinePassed(match: VotableMatch, now = new Date()) {
  return match.vote_deadline ? new Date(match.vote_deadline) < now : false;
}

/**
 * 이 경기를 **기록으로 보는가** — 명단이 「누가 왔었나」를 말하는 경기인가.
 *
 * ── 왜 필요한가 ───────────────────────────────────────────────────
 * 참석 명단이 두 질문에 쓰인다. 답이 반대다:
 *
 *   예정 경기  「누가 오나」   → 팀을 나간 사람은 **빼야 한다.** 오지 않을 사람이다
 *   지난 경기  「누가 왔었나」 → 나간 사람도 **남아야 한다.** 실제로 왔던 기록이다
 *
 * 2026-09-18에 소프트 삭제로 바꾸고 나서 끝난 경기의 「참석 1명」이 「참석 0명」이 됐다 —
 * 투표 행은 DB에 남았는데 명단이 현재 멤버만 돌았다. **기록이 화면에서 틀려졌다.**
 *
 * ⚠ **상태 플래그만으로는 모자란다.** `status`는 'open' | 'locked' | 'completed'인데,
 *   날짜가 지났는데 아무도 완료 처리를 안 한 경기는 계속 'open'이다. 그 경기의 명단을
 *   「누가 오나」로 그리면 이미 지난 경기에서 나간 사람이 빠진다. 그래서 날짜도 본다.
 *
 * ⚠ **유예(MATCH_GRACE_MS)를 안 쓴다.** 그건 「지금 다루는 경기인가」(경기운영·정산이
 *   쓰는 창)고, 이건 「기록인가」다 — matchWindow.ts 머리말의 그 구분이다.
 *   킥오프가 지나면 그 순간부터 명단은 기록이다. 오늘 저녁 8시 경기를 밤 9시에 봐도
 *   「왔던 사람」이 맞다.
 */
export function isMatchRecord(
  match: { status: MatchStatus; match_date: string },
  now = new Date()
) {
  return match.status === 'completed' || new Date(match.match_date) < now;
}

/*
  집계에 셀 투표만 고른다 — **참석 명단(rosterMembers)과 같은 규칙이다.**

    예정  「누가 오나」   → 현재 멤버의 투표만 센다
    지난  「누가 왔었나」 → 투표한 사람 전부 센다 (나간 사람 포함)

  ⚠ **왜 있나.** 2026-09-19에 같은 화면에 한 경기의 숫자가 둘로 나왔다.
    Demo FC의 9/25 예정 경기에서 kdtest3가 나간 뒤:

      홈 카드      참석 1 / 정원 12명 · 참석 1 · 미정 0 · 불참 0
      명단 시트    전체 1 · 참석 0 · 불참 0 · 미투표 1

    명단은 나간 사람을 뺐는데 **집계는 그 사람이 남기고 간 투표를 그대로 셌다.**
    소프트 삭제로 바꿀 때 명단만 고치고 집계를 안 따라 고쳤다.

  ⚠ **DB는 건드리지 않는다. 화면에서만 거른다** — 재참여하면
    (`join_team_by_invite`가 `left_at`을 비운다) 다음 렌더부터 다시 센다.
*/
export function countableVotes<V extends { team_member_id: string }>(
  match: { status: MatchStatus; match_date: string; votes: V[] },
  activeIds: ReadonlySet<string>,
  now = new Date()
): V[] {
  if (isMatchRecord(match, now)) return match.votes;
  return match.votes.filter((v) => activeIds.has(v.team_member_id));
}

/** 지금 이 경기에 투표할 수 있는지 */
export function isVotingOpen(match: VotableMatch, now = new Date()) {
  return match.status === 'open' && !isDeadlinePassed(match, now);
}

/**
 * 투표가 잠긴 이유 — 열려 있으면 null.
 *
 * 흐려진 버튼이나 사라진 버튼만으로는 고장인지 마감인지 알 수 없다.
 * 총무에게는 되돌리는 방법까지 알려준다.
 */
export function votingLockNote(match: VotableMatch, isAdmin: boolean, now = new Date()): string | null {
  if (match.status === 'completed') return '종료된 경기예요';
  if (match.status !== 'open') return '총무가 투표를 마감했어요';
  if (!isDeadlinePassed(match, now)) return null;
  return `투표가 마감됐어요${isAdmin ? ' · 메뉴에서 마감 시각을 바꿀 수 있어요' : ''}`;
}
