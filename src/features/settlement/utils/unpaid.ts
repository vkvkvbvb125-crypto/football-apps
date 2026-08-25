// src/features/settlement/utils/unpaid.ts
// 내가 아직 안 낸 돈.
//
// 세 곳이 같은 값을 본다 — 팀 홈(예전 미납 타일), 팀 설정의 나가기 경고, 하단 탭 뱃지.
// 각자 계산하면 「홈에서는 0원인데 탭에는 빨간 점」 같은 상태가 나오고, 그때 어느 쪽이
// 맞는지 알 방법이 없다. 정의를 여기 한 곳에 못 박는다.
//
// 면제(exempt)는 빼고 이미 낸 것(paid)도 뺀다. 진행중 정산과 지난 정산을 같이 세는 건,
// 지난 정산에 미납이 남아 있어도 그건 여전히 내가 낼 돈이기 때문이다.
import type { Settlement } from '../stores/settlementStore';

export function myUnpaidAmount(
  current: Settlement | null,
  past: Settlement[],
  myMembershipId: string | undefined,
): number {
  if (!myMembershipId) return 0;
  return [...(current ? [current] : []), ...past]
    .flatMap((st) => st.shares)
    .filter((sh) => sh.teamMemberId === myMembershipId && !sh.paid && !sh.exempt)
    .reduce((total, sh) => total + sh.amount, 0);
}
