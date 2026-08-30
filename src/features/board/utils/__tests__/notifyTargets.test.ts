// notifyTargets.test.ts — 댓글 알림을 누가 받는가
//
// 이 함수는 이번 세션에 「글쓴이만」에서 「글쓴이 + 이전 댓글 작성자」로 넓혔다.
// 넓히는 쪽이 위험한 방향이다 — 틀리면 알림이 더 많은 사람에게 간다.
// 특히 「나 자신 제외」가 빠지면 내가 쓴 댓글로 나에게 알림이 온다.
import { describe, it, expect } from 'vitest';
import { notifyTargets } from '../notifyTargets';

describe('notifyTargets', () => {
  it('글쓴이에게 간다', () => {
    expect(notifyTargets('author', 'me', [])).toEqual(['author']);
  });

  it('이전 댓글 작성자도 받는다', () => {
    expect(notifyTargets('author', 'me', ['x', 'y']).sort()).toEqual(['author', 'x', 'y']);
  });

  /* 방금 단 내 댓글도 목록에 들어 있다 — 여기서 걸러야 나에게 안 울린다 */
  it('나 자신은 언제나 빠진다', () => {
    expect(notifyTargets('author', 'me', ['me', 'x'])).not.toContain('me');
  });

  it('내 글에 내가 댓글을 달면 아무에게도 안 간다', () => {
    expect(notifyTargets('me', 'me', ['me'])).toEqual([]);
  });

  /* 글쓴이가 이미 댓글을 달았으면 한 번만 — 두 번 울리면 안 된다 */
  it('중복은 한 번으로 접힌다', () => {
    const out = notifyTargets('author', 'me', ['author', 'author', 'x']);
    expect(out.filter((id) => id === 'author')).toHaveLength(1);
    expect(out.sort()).toEqual(['author', 'x']);
  });

  it('이전 댓글이 없으면 글쓴이 하나다', () => {
    expect(notifyTargets('author', 'me', [])).toHaveLength(1);
  });
});
