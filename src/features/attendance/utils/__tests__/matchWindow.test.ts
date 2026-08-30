// matchWindow.test.ts — 「지금 다루는 경기인가」의 경계
//
// 이 파일이 지키는 것은 값(3시간)이 아니라 **경계의 방향**이다.
// 유예를 두 화면이 각자 들고 있다가 한 곳으로 모은 자리라(0b3ff66), 다시 갈리거나
// 부등호가 뒤집히면 「경기운영에서는 운영 중인데 정산에서는 끝났다」가 돌아온다.
import { describe, it, expect } from 'vitest';
import { MATCH_GRACE_MS, liveSince, isLiveMatch, liveMatchesFrom } from '../matchWindow';

const NOW = new Date('2026-08-31T20:00:00.000Z');
const at = (ms: number) => ({ match_date: new Date(NOW.getTime() + ms).toISOString() });

describe('MATCH_GRACE_MS', () => {
  it('3시간이다', () => {
    expect(MATCH_GRACE_MS).toBe(3 * 60 * 60 * 1000);
  });
});

describe('liveSince', () => {
  it('지금에서 유예만큼 뺀 시각이다', () => {
    expect(liveSince(NOW).getTime()).toBe(NOW.getTime() - MATCH_GRACE_MS);
  });
});

describe('isLiveMatch', () => {
  it('앞으로 있을 경기는 다룬다', () => {
    expect(isLiveMatch(at(+60 * 60 * 1000), NOW)).toBe(true);
  });

  it('방금 시작한 경기는 다룬다', () => {
    expect(isLiveMatch(at(-10 * 60 * 1000), NOW)).toBe(true);
  });

  /*
    경계는 「이상」이다 — 정확히 3시간 전에 시작한 경기는 아직 다룬다.
    ⚠ 이 한 칸이 뒤집히면 같은 순간에 경기운영은 「운영 중」, 정산은 「미등록」이 된다.
      그 어긋남을 없애려고 만든 파일이라 경계를 양쪽에서 붙든다.
  */
  it('정확히 유예 경계면 아직 다룬다', () => {
    expect(isLiveMatch(at(-MATCH_GRACE_MS), NOW)).toBe(true);
  });

  it('유예를 1ms라도 넘기면 안 다룬다', () => {
    expect(isLiveMatch(at(-MATCH_GRACE_MS - 1), NOW)).toBe(false);
  });
});

describe('liveMatchesFrom', () => {
  it('지난 것을 걸러내고 가까운 순으로 준다', () => {
    const past = at(-MATCH_GRACE_MS - 1000);
    const soon = at(+30 * 60 * 1000);
    const later = at(+5 * 60 * 60 * 1000);
    const justNow = at(-30 * 60 * 1000);
    const out = liveMatchesFrom([later, past, soon, justNow], NOW);
    expect(out).toEqual([justNow, soon, later]);
  });

  it('빈 목록은 빈 목록이다', () => {
    expect(liveMatchesFrom([], NOW)).toEqual([]);
  });

  /* 원본 배열을 뒤집어 놓으면 호출한 쪽의 목록이 조용히 재정렬된다 */
  it('원본을 건드리지 않는다', () => {
    const a = at(+2 * 60 * 60 * 1000);
    const b = at(+1 * 60 * 60 * 1000);
    const list = [a, b];
    liveMatchesFrom(list, NOW);
    expect(list).toEqual([a, b]);
  });
});
