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

/**
 * 인원수별 포메이션 — 각 줄이 골대 쪽에서 상대 골대 쪽으로 한 줄씩이다.
 *
 * 5명은 1-2-1(골키퍼 포함), 6명은 2-2-1. 풋살 표준 배치를 그대로 쓴다.
 * 그 밖의 인원수는 포메이션을 그리지 않는다 — 억지로 배치하면 실제 경기와 안 맞는다.
 */
export const FORMATIONS: Record<number, { label: string; rows: Position[][] }> = {
  5: { label: '1-2-1', rows: [['GOLEIRO'], ['FIXO'], ['ALA', 'ALA'], ['PIVO']] },
  6: { label: '2-2-1', rows: [['GOLEIRO'], ['FIXO', 'FIXO'], ['ALA', 'ALA'], ['PIVO']] },
};

export function formationFor(playerCount: number) {
  return FORMATIONS[playerCount] ?? null;
}
