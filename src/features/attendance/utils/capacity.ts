// src/features/attendance/utils/capacity.ts
// 정원·대기자 로직 — 홈/일정/명단이 같은 숫자를 쓰도록 한 곳에서 계산한다.
//
// 승격 함수(nextPromotion)가 있었다. 지웠다 — 대기는 저장된 상태가 아니라 매번
// updated_at 오름차순 정렬로 다시 계산되는 것이라, 참석자가 취소하면 다음 사람이
// 저절로 정원 안으로 들어온다. 승격시킬 대상을 따로 고를 일이 없다.
// 죽은 export로 남겨 두면 다음 사람이 「승격 로직이 여기 있구나」로 읽는다.
import type { AttendanceStatus } from '../../../types/database';

export interface VoteLike {
  team_member_id: string;
  status: AttendanceStatus;
  updated_at?: string | null;
}

export interface CapacityResult {
  /** 정원 내 확정 참석자 (선착순) */
  confirmed: string[];
  /** 정원을 넘겨 대기로 밀린 사람 (순번 순서) */
  waitlist: string[];
  /** 화면에 쓰는 확정 참석 인원 — 절대 정원을 넘지 않는다 */
  attendCount: number;
  absentCount: number;
  /** 아직 투표하지 않은 인원 */
  pendingCount: number;
  isFull: boolean;
  /** 내 대기 순번 (1부터). 대기가 아니면 0 */
  myWaitPosition: number;
}

/**
 * 참석 투표를 정원 기준으로 확정/대기로 나눈다.
 * - 선착순: updated_at 오름차순 (없으면 배열 순서)
 * - attendCount는 항상 min(참석 투표 수, capacity)
 */
export function resolveCapacity(
  votes: VoteLike[],
  capacity: number,
  memberCount: number,
  myMemberId?: string | null
): CapacityResult {
  const attendVotes = votes
    .filter((v) => v.status === 'attend')
    .sort((a, b) => {
      const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return ta - tb;
    });

  const confirmed = attendVotes.slice(0, capacity).map((v) => v.team_member_id);
  const waitlist = attendVotes.slice(capacity).map((v) => v.team_member_id);
  const absentCount = votes.filter((v) => v.status === 'absent').length;

  const myWaitIndex = myMemberId ? waitlist.indexOf(myMemberId) : -1;

  return {
    confirmed,
    waitlist,
    attendCount: confirmed.length,
    absentCount,
    pendingCount: Math.max(0, memberCount - confirmed.length - waitlist.length - absentCount),
    isFull: confirmed.length >= capacity,
    myWaitPosition: myWaitIndex >= 0 ? myWaitIndex + 1 : 0,
  };
}

/** 참석 버튼 라벨 — 정원이 찼으면 대기 신청/대기 N번으로 바뀐다 */
export function attendButtonLabel(cap: CapacityResult, myVote?: AttendanceStatus | null) {
  if (cap.myWaitPosition > 0) return `대기 ${cap.myWaitPosition}번`;
  if (cap.isFull && myVote !== 'attend') return '대기 신청';
  return '참석';
}

