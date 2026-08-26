// src/features/attendance/utils/optimisticVote.ts
// 투표를 서버 응답 전에 화면에 먼저 반영하고, 실패하면 되돌리는 데 필요한 순수 부분.
//
// 스토어가 아니라 여기 두는 이유는 되돌리기가 「배열 스냅샷 복원」이면 안 되기 때문이다.
// 낙관 반영 중에 화면 진입 이펙트가 loadMatches()를 부르면 그 사이 서버 진실이 도착한다.
// 그때 열 때 찍어둔 옛 votes 배열을 통째로 되돌리면 남의 최신 표가 사라진다 —
// 낡은 값이 남의 최신 값을 덮는 구조다. 그래서 되돌리기도 「내 행 하나를 지금 상태에
// 얹는」 같은 연산이고, 반영과 롤백이 putMyVote 하나를 공유한다.
import type { AttendanceStatus } from '../../../types/database';
import type { MatchWithVotes, VoteRow } from '../services/attendanceService';

/**
 * 낙관 행의 id 접두사.
 *
 * 서버 행의 id는 지금도 읽는 곳이 없다(.votes 소비 20줄 전부 team_member_id / status /
 * updated_at만 본다). 하지만 낙관 행의 id는 다르다 — 롤백이 이 접두사로 「이건 아직
 * 서버에 없는 행」을 판별한다. 접두사를 바꾸면 판별이 조용히 깨지고, 연타 실패 시
 * 서버에 없는 값이 화면에 남는다. 이 문자열은 계약이다.
 */
export const OPTIMISTIC_ID_PREFIX = 'optimistic:';

/** 아직 서버에 없는 행. 자기가 덮은 원래 값을 들고 다닌다 */
export type OptimisticVote = VoteRow & { replaced: VoteRow | null };

export function isOptimisticVote(v: VoteRow): v is OptimisticVote {
  return v.id.startsWith(OPTIMISTIC_ID_PREFIX);
}

/**
 * 실패했을 때 되돌릴 「진짜 서버 값」.
 *
 * 연타하면 두 번째 호출이 보는 현재 행은 첫 번째가 깔아 둔 낙관 행이다. 그걸 그대로
 * 되돌릴 값으로 삼으면, 둘 다 실패했을 때 서버에 없는 값이 화면에 남는다. 낙관 행이
 * 들고 있는 replaced가 그 행이 덮기 전의 값이므로 그쪽을 쓴다. 원래 행이 있었든
 * (교체) 없었든(신규) 양쪽이 같은 방식으로 닫힌다.
 */
export function rollbackTarget(current: VoteRow | null | undefined): VoteRow | null {
  if (!current) return null;
  return isOptimisticVote(current) ? current.replaced : current;
}

/**
 * 화면에 먼저 얹을 행.
 *
 * updated_at은 새로 찍을 때만 now다. 바꿀 때는 원래 값을 유지한다 —
 * capacity.ts가 이 값을 오름차순으로 정렬해 대기 순번을 매기는데, 서버는 재투표에서
 * 이 칸을 올리지 않는다(트리거가 없고 castVote 페이로드에도 없다). now로 통일하면
 * 낙관 반영에서 맨 뒤로 갔다가 재조회에서 원래 순번으로 튀어 올라온다.
 *
 * 새로 찍을 때의 now는 기기 시계다 — 시계가 어긋난 기기면 정원이 찬 경계에서 낙관 구간
 * 동안만 대기 순번이 한 칸 다를 수 있다. 재조회가 서버 값으로 덮으므로 그대로 둔다.
 */
export function makeOptimisticVote(
  matchId: string,
  memberId: string,
  status: AttendanceStatus,
  replaced: VoteRow | null,
  now: Date = new Date()
): OptimisticVote {
  return {
    id: `${OPTIMISTIC_ID_PREFIX}${matchId}:${memberId}`,
    match_id: matchId,
    team_member_id: memberId,
    status,
    updated_at: replaced?.updated_at ?? now.toISOString(),
    replaced,
  };
}

/**
 * 내 행 하나만 갈아 끼운 matches를 새로 만든다. row가 null이면 지운다.
 *
 * 있던 자리에 그대로 놓는다. 지웠다 뒤에 붙이면 updated_at이 같은 표들 사이에서
 * 순서가 바뀌고, capacity.ts의 선착순이 흔들린다.
 *
 * votes 말고는 아무것도 안 건드린다 — 참석 수·대기 순번·정원은 전부 여기서 파생된다.
 */
export function putMyVote(
  matches: MatchWithVotes[],
  matchId: string,
  memberId: string,
  row: VoteRow | null
): MatchWithVotes[] {
  return matches.map((m) => {
    if (m.id !== matchId) return m;
    const at = m.votes.findIndex((v) => v.team_member_id === memberId);
    if (!row) return at < 0 ? m : { ...m, votes: m.votes.filter((_, i) => i !== at) };
    const votes = [...m.votes];
    if (at < 0) votes.push(row);
    else votes[at] = row;
    return { ...m, votes };
  });
}
