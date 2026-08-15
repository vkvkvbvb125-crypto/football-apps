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
