// src/features/team/avatarTint.ts
// 아바타 배경색 — 자산 없이 일러스트 아바타를 흉내 낸다.
//
// 레퍼런스는 사람마다 다른 일러스트다. 우리에겐 그 자산이 없고, 만들 수도 없다.
// 대신 두 가지로 근사한다: 사람 아이콘(Ionicons person) + 사람마다 다른 배경색.
// 이니셜 글자보다 이쪽이 레퍼런스에 가깝다 — 겹쳐 놓는 작은 원에서 글자는 읽히지도
// 않으면서 「글자 줄」로 보이게 만들었다(memberstrip.check의 천장 계산 참고).
//
// 색은 id에서 뽑는다. 랜덤이 아니라 **같은 사람은 항상 같은 색**이어야 한다 —
// 렌더할 때마다 바뀌면 명단을 훑는 사람이 색으로 사람을 못 알아본다. 서버에 색 컬럼을
// 두는 것도 방법이지만, 값이 id에서 결정되면 저장할 것이 없다.
//
// 여섯 색이다. 팀 정원이 12 안팎이라 여섯이면 절반은 색이 겹치는데, 그래도 늘린
// 것보다 낫다: 어두운 배경에서 서로 구별되면서 초록 계열(앱의 강조색)과 안 부딪히는
// 색이 그리 많지 않다. 색은 사람을 특정하는 수단이 아니라 「서로 다르다」만 말한다 —
// 특정은 이름이 있는 멤버 목록이 한다.
import { colors } from '../../theme';

const TINTS = [
  { bg: 'rgba(56,132,255,0.20)', fg: '#7FB2FF' }, // 파랑
  { bg: 'rgba(210,163,76,0.20)', fg: colors.gold }, // 금
  { bg: 'rgba(168,85,247,0.20)', fg: '#C7A2F7' }, // 보라
  { bg: 'rgba(236,72,120,0.18)', fg: '#F2A0B8' }, // 분홍
  { bg: 'rgba(45,212,191,0.18)', fg: '#7FE3D6' }, // 청록
  { bg: 'rgba(251,146,60,0.18)', fg: '#F7BC8A' }, // 주황
] as const;

/** id → 항상 같은 색 한 쌍. 순서가 아니라 값에서 나오므로 목록이 바뀌어도 안 흔들린다 */
export function avatarTint(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

export const AVATAR_TINT_COUNT = TINTS.length;
