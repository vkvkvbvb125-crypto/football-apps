import { describe, expect, it } from 'vitest';
import { routeFor } from '../notificationRoute';

/*
  이 함수가 틀리면 사용자를 엉뚱한 화면으로 데려간다 — 안 데려다주는 것보다 나쁘다.
  그래서 「간다」보다 「안 간다」를 더 촘촘히 잡는다.
*/
describe('routeFor — 갈 곳이 있을 때', () => {
  it('경기 알림 셋은 일정 탭 + 그 날짜로 간다', () => {
    for (const kind of ['new_match', 'deadline', 'weather']) {
      expect(routeFor({ kind, matchDate: '2026-09-05T19:00:00.000Z' })).toEqual({
        screen: 'Attendance',
        params: { focusDate: '2026-09-05T19:00:00.000Z' },
      });
    }
  });

  it('정산 알림은 정산 탭 + 그 정산으로 간다', () => {
    expect(routeFor({ kind: 'settlement', settlementId: 'abc-123' })).toEqual({
      screen: 'Settlement',
      params: { openSettlementId: 'abc-123' },
    });
  });

  it('공지·게시판은 1단계에서 팀 탭까지만 간다 (파라미터 없음)', () => {
    for (const kind of ['announcement', 'mention', 'comment']) {
      expect(routeFor({ kind })).toEqual({ screen: 'Team' });
    }
  });

  it('파라미터가 비면 탭까지만 간다 — 값이 없다고 라우팅을 버리지 않는다', () => {
    expect(routeFor({ kind: 'new_match' })).toEqual({ screen: 'Attendance' });
    expect(routeFor({ kind: 'settlement' })).toEqual({ screen: 'Settlement' });
    // 빈 문자열도 없는 것으로 본다 — ''를 focusDate로 넘기면 Invalid Date가 된다
    expect(routeFor({ kind: 'new_match', matchDate: '' })).toEqual({ screen: 'Attendance' });
  });
});

describe('routeFor — 안 가는 것이 정답일 때', () => {
  /*
    셋 다 null이고, 그때 하는 일은 「아무 데도 안 간다」다.
    홈으로 보내면 보던 화면을 빼앗는 손해만 남는다.
  */
  it('kind가 없는 옛 알림 — 이 커밋 전에 보낸 것 전부가 여기 해당한다', () => {
    expect(routeFor({})).toBeNull();
    expect(routeFor({ matchDate: '2026-09-05T19:00:00.000Z' })).toBeNull();
  });

  it('모르는 kind — 앱이 옛 버전인데 서버가 새 종류를 보낸 경우', () => {
    expect(routeFor({ kind: 'poll' })).toBeNull();
    expect(routeFor({ kind: 'new_match_v2' })).toBeNull();
  });

  it('data가 아예 없거나 모양이 다르면', () => {
    expect(routeFor(undefined)).toBeNull();
    expect(routeFor(null)).toBeNull();
    expect(routeFor('new_match')).toBeNull();
    expect(routeFor(42)).toBeNull();
    expect(routeFor([])).toBeNull();
  });

  it('kind가 문자열이 아니면', () => {
    expect(routeFor({ kind: 1 })).toBeNull();
    expect(routeFor({ kind: null })).toBeNull();
  });
});

describe('routeFor — 넘기는 값의 모양', () => {
  it('파라미터 이름이 목적지가 읽는 이름과 같다', () => {
    // AttendanceScreen은 focusDate를, SettlementScreen은 openSettlementId를 읽는다.
    // 이름이 갈리면 화면은 뜨는데 아무 일도 안 일어난다 — 조용히 실패한다.
    expect(routeFor({ kind: 'weather', matchDate: 'x' })!.params).toHaveProperty('focusDate');
    expect(routeFor({ kind: 'settlement', settlementId: 'x' })!.params).toHaveProperty('openSettlementId');
  });

  it('엉뚱한 파라미터를 실어 보내지 않는다', () => {
    // settlementId가 경기 알림에 섞여 와도 무시한다
    const r = routeFor({ kind: 'new_match', matchDate: 'd', settlementId: 's' });
    expect(r).toEqual({ screen: 'Attendance', params: { focusDate: 'd' } });
  });
});
