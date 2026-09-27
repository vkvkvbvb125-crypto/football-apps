import type { ThemeName } from '../../theme';
// src/features/team/positions.ts — 풋살 포지션 정의
//
// 팀원의 선호 포지션(team_members.position)과 팀 분배 화면의 포메이션이 같은 값을 쓴다.
// 한쪽만 고치면 배치가 어긋나므로 정의는 여기 하나만 둔다.

/** 풋살 4포지션. DB에는 이 문자열이 그대로 들어간다 */
export const POSITIONS = ['PIVO', 'ALA', 'FIXO', 'GOLEIRO'] as const;

export type Position = (typeof POSITIONS)[number];

/**
 * 한글 이름과 역할.
 *
 * 풋살을 처음 하는 사람은 PIVO·ALA·FIXO를 모른다 — 축구의 공격수/미드필더와 이름이 달라서
 * 짐작도 안 된다. 그래서 용어를 쓰는 자리마다 역할을 반드시 같이 보여준다.
 * short는 칩처럼 좁은 자리용, role은 포메이션 그림용이다.
 */
export const POSITION_INFO: Record<Position, { ko: string; role: string; short: string }> = {
  PIVO: { ko: '피보', role: '최전방 공격', short: '공격' },
  ALA: { ko: '알라', role: '측면 공수', short: '측면' },
  FIXO: { ko: '픽소', role: '최후방 수비', short: '수비' },
  GOLEIRO: { ko: '골레이로', role: '골키퍼', short: '골키퍼' },
};

/**
 * 포지션 색 — 목록에서 자리를 색으로 먼저 읽게 한다.
 * 팀 분배 카드의 팀 색(GROUP_COLOR)과 겹치지 않게 골랐다.
 */
/*
  ⚠ 테마마다 다르다. 라이트에서 같은 값을 쓰면 흰 배경에 옅은 파랑·주황이라
    글자로 안 읽힌다 — 이 색들은 「어두운 배경에서 서로 구별되게」 고른 것이다.
    어느 것이 무엇인지(색조)는 유지하고 밝기만 내린다.
*/
export const POSITION_COLOR: Record<ThemeName, Record<Position, string>> = {
  dark: {
    PIVO: '#60A5FA',
    ALA: '#22C55E',
    FIXO: '#F59E0B',
    GOLEIRO: '#C084FC',
  },
  light: {
    PIVO: '#1D4ED8',
    ALA: '#147536',
    FIXO: '#B45309',
    GOLEIRO: '#7E22CE',
  },
};

/** 칩을 탭하면 이 순서로 돈다. 마지막은 '미지정'(null) */
const CYCLE: (Position | null)[] = [...POSITIONS, null];

export function nextPosition(current: Position | null): Position | null {
  return CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];
}

/** 좁은 자리(칩)용 — 용어만 두면 무슨 자리인지 모르니 역할을 붙인다 */
export function positionLabel(p: Position | null): string {
  return p ? `${POSITION_INFO[p].ko} · ${POSITION_INFO[p].short}` : '포지션 선택';
}

/** DB에서 온 값이 아는 포지션인지 — 예전 값이나 오타가 들어와도 화면이 깨지지 않게 */
export function toPosition(value: string | null | undefined): Position | null {
  return value && (POSITIONS as readonly string[]).includes(value) ? (value as Position) : null;
}

export interface Formation {
  /** ⚠ **골키퍼를 뺀** 필드 배치다. 「2-2-1」은 필드 5명이고 팀은 6명이다 */
  label: string;
  /** 우리 골대 → 상대 골대 순서. 전부 합치면 **골키퍼 포함** 팀 인원이다 */
  rows: Position[][];
}

/**
 * 팀 인원별 포메이션 후보.
 *
 * ── ⚠ 표기 규칙 — 이것부터 읽어라 ────────────────────────────────
 *
 *     키(4·5·6·7)  = 팀 인원 **골키퍼 포함**
 *     label        = 골키퍼를 **뺀** 필드 배치
 *
 *   그래서 **label의 숫자 합 + 1 = 키**다. 6번 키의 「2-2-1」은 2+2+1=5,
 *   거기에 골키퍼 하나를 더해 6이다.
 *
 * ⚠ **이 규칙을 안 정하고 4명을 추가하면 사고가 난다.** 「2-2」가 4명(GK+3)인지
 *   5명(GK+4)인지 갈리지 않기 때문이다. 화면 헤더도 「6명 · 골키퍼 포함」에서
 *   **「골키퍼 1 · 필드 5」**로 바꿨다 — 그래야 배지 숫자와 헤더 숫자가
 *   **서로 검산된다.** `formation.check.ts`가 이 산수를 붙든다.
 *
 * ⚠ **4~7만 있다.** 3명 이하는 배치랄 것이 없고(골키퍼+2), 8명 이상은
 *   풋살이 아니다. 그 밖의 인원수에서는 화면이 **안내를 그린다** —
 *   전에는 아무것도 안 그려서 기능이 있는 줄도 몰랐다(서랍 25).
 *
 * ⚠ **각 배열의 맨 앞이 기본값이다.** 5·6의 기본값은 예전 값 그대로 뒀다 —
 *   기존 화면이 안 바뀌어야 한다.
 */
export const FORMATIONS: Record<number, Formation[]> = {
  4: [
    { label: '1-1-1', rows: [['GOLEIRO'], ['FIXO'], ['ALA'], ['PIVO']] },
    { label: '2-1', rows: [['GOLEIRO'], ['FIXO', 'FIXO'], ['PIVO']] },
    { label: '1-2', rows: [['GOLEIRO'], ['FIXO'], ['ALA', 'ALA']] },
  ],
  5: [
    { label: '1-2-1', rows: [['GOLEIRO'], ['FIXO'], ['ALA', 'ALA'], ['PIVO']] },
    { label: '2-2', rows: [['GOLEIRO'], ['FIXO', 'FIXO'], ['ALA', 'ALA']] },
    { label: '3-1', rows: [['GOLEIRO'], ['FIXO', 'FIXO', 'FIXO'], ['PIVO']] },
  ],
  6: [
    { label: '2-2-1', rows: [['GOLEIRO'], ['FIXO', 'FIXO'], ['ALA', 'ALA'], ['PIVO']] },
    { label: '1-3-1', rows: [['GOLEIRO'], ['FIXO'], ['ALA', 'ALA', 'ALA'], ['PIVO']] },
    { label: '2-1-2', rows: [['GOLEIRO'], ['FIXO', 'FIXO'], ['ALA'], ['PIVO', 'PIVO']] },
  ],
  7: [
    { label: '2-2-2', rows: [['GOLEIRO'], ['FIXO', 'FIXO'], ['ALA', 'ALA'], ['PIVO', 'PIVO']] },
    { label: '3-2-1', rows: [['GOLEIRO'], ['FIXO', 'FIXO', 'FIXO'], ['ALA', 'ALA'], ['PIVO']] },
    { label: '2-3-1', rows: [['GOLEIRO'], ['FIXO', 'FIXO'], ['ALA', 'ALA', 'ALA'], ['PIVO']] },
  ],
};

/** 그 인원수의 후보들. 없으면 null — 부르는 쪽이 안내를 그린다 */
export function formationsFor(playerCount: number): Formation[] | null {
  return FORMATIONS[playerCount] ?? null;
}

/**
 * 포메이션을 못 그리는 인원수에 **무슨 말을 할까.**
 *
 * ⚠ **두 경우의 답이 다르다.**
 *   · 많을 때  — 팀을 더 나누면 된다. **총무만 할 수 있는 일**이라 총무에게만 보인다
 *   · 적을 때  — 나누는 것이 답이 아니다. 그냥 **아직 이르다**는 설명이고,
 *     할 일이 없으므로 팀원에게도 보인다
 */
export function formationHint(playerCount: number): { text: string; adminOnly: boolean } | null {
  if (formationsFor(playerCount)) return null;
  if (playerCount >= 8) {
    return { text: `${playerCount}명은 포메이션을 그릴 수 없어요 · 팀을 더 나누면 보여드려요`, adminOnly: true };
  }
  return { text: '4명부터 포메이션을 보여드려요', adminOnly: false };
}
