// capacity.test.ts — 정원·대기 순번
//
// 홈·일정·명단이 이 한 곳의 숫자를 쓴다. 여기가 틀리면 세 화면이 같이 틀리고,
// 셋이 같은 값을 보여주므로 「일치하니 맞겠지」로 읽힌다.
//
// ⚠ pendingCount는 이 저장소가 attendance_votes에 DELETE 정책을 안 넣기로 한
//   근거이기도 하다 — 행이 남아야 「응답했는데 미정」과 「아직 응답 안 함」이 갈린다.
//   그 구분을 여기서 붙든다.
import { describe, it, expect } from 'vitest';
import { resolveCapacity, attendButtonLabel, type VoteLike } from '../capacity';

const v = (id: string, status: VoteLike['status'], at?: string): VoteLike => ({
  team_member_id: id, status, updated_at: at ?? null,
});
const T = (n: number) => new Date(2026, 7, 31, 12, n).toISOString();

describe('선착순', () => {
  it('updated_at 오름차순으로 정원을 채운다', () => {
    const r = resolveCapacity(
      [v('c', 'attend', T(3)), v('a', 'attend', T(1)), v('b', 'attend', T(2))], 2, 3);
    expect(r.confirmed).toEqual(['a', 'b']);
    expect(r.waitlist).toEqual(['c']);
  });

  /* updated_at이 없으면 0으로 취급된다 — 있는 사람보다 앞선다 */
  it('updated_at이 없는 표는 가장 앞으로 간다', () => {
    const r = resolveCapacity([v('a', 'attend', T(1)), v('nul', 'attend')], 1, 2);
    expect(r.confirmed).toEqual(['nul']);
  });
});

describe('attendCount는 정원을 안 넘는다', () => {
  it('참석이 정원보다 많아도 정원까지만 센다', () => {
    const votes = ['a', 'b', 'c', 'd'].map((id, i) => v(id, 'attend', T(i)));
    const r = resolveCapacity(votes, 2, 4);
    expect(r.attendCount).toBe(2);
    expect(r.waitlist).toHaveLength(2);
    expect(r.isFull).toBe(true);
  });
});

describe('pendingCount — 「응답 안 함」', () => {
  /*
    멤버 수에서 응답한 사람(확정+대기+불참)을 뺀다.
    ⚠ 「미정」으로 응답한 사람은 어느 쪽에도 안 들어가므로 pending에 남는다.
      그게 의도다 — 취소가 삭제가 아니라 undecided라서, 행이 남아야 이 둘이 갈린다.
  */
  it('아무도 투표 안 했으면 전원이 미응답이다', () => {
    expect(resolveCapacity([], 12, 6).pendingCount).toBe(6);
  });

  it('불참도 응답이라 미응답에서 빠진다', () => {
    const r = resolveCapacity([v('a', 'attend', T(1)), v('b', 'absent', T(2))], 12, 6);
    expect(r.absentCount).toBe(1);
    expect(r.pendingCount).toBe(4);
  });

  it('대기자도 응답한 사람이다', () => {
    const votes = ['a', 'b', 'c'].map((id, i) => v(id, 'attend', T(i)));
    expect(resolveCapacity(votes, 1, 5).pendingCount).toBe(2);
  });

  it('음수로 내려가지 않는다', () => {
    const votes = ['a', 'b', 'c'].map((id, i) => v(id, 'attend', T(i)));
    expect(resolveCapacity(votes, 12, 1).pendingCount).toBe(0);
  });
});

describe('내 대기 순번', () => {
  it('대기 첫 번째는 1이다 (0이 아니다)', () => {
    const votes = ['a', 'b', 'me'].map((id, i) => v(id, 'attend', T(i)));
    expect(resolveCapacity(votes, 2, 3, 'me').myWaitPosition).toBe(3 - 2);
  });

  it('정원 안이면 0이다', () => {
    const votes = ['me', 'b'].map((id, i) => v(id, 'attend', T(i)));
    expect(resolveCapacity(votes, 2, 2, 'me').myWaitPosition).toBe(0);
  });

  it('내 id를 안 주면 0이다', () => {
    const votes = ['a', 'b', 'c'].map((id, i) => v(id, 'attend', T(i)));
    expect(resolveCapacity(votes, 1, 3).myWaitPosition).toBe(0);
  });
});

describe('참석 버튼 라벨', () => {
  const cap = (over: Partial<ReturnType<typeof resolveCapacity>>) =>
    ({ confirmed: [], waitlist: [], attendCount: 0, absentCount: 0, pendingCount: 0,
       isFull: false, myWaitPosition: 0, ...over });

  it('대기 중이면 순번을 보여준다', () => {
    expect(attendButtonLabel(cap({ myWaitPosition: 2 }))).toBe('대기 2번');
  });

  it('정원이 찼고 내가 참석이 아니면 「대기 신청」이다', () => {
    expect(attendButtonLabel(cap({ isFull: true }), null)).toBe('대기 신청');
  });

  /* 이미 확정 참석이면 정원이 차 있어도 「참석」이다 — 내 자리는 이미 있다 */
  it('정원이 찼어도 내가 확정이면 「참석」이다', () => {
    expect(attendButtonLabel(cap({ isFull: true }), 'attend')).toBe('참석');
  });

  it('자리가 있으면 「참석」이다', () => {
    expect(attendButtonLabel(cap({}), null)).toBe('참석');
  });
});
