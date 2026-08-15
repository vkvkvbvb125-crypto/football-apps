// scripts/board.check.ts — 게시판 순수 로직 검증
//
//   node --experimental-strip-types scripts/board.check.ts
//
// 이 저장소에는 테스트 러너가 없다. 정렬은 화면 둘(게시판, 팀 홈 최근 게시글)이
// 같은 순서를 보여야 하는 규칙이라, 눈으로만 확인하고 넘어가면 한쪽만 어긋난다.
import assert from 'node:assert/strict';
import { sortPosts } from '../src/features/board/utils/sort.ts';

const p = (id: string, createdAt: string, isPinned = false) => ({ id, createdAt, isPinned });

// 고정이 없으면 최신순
assert.deepEqual(
  sortPosts([p('a', '2026-08-01'), p('c', '2026-08-03'), p('b', '2026-08-02')]).map((x) => x.id),
  ['c', 'b', 'a'],
  '고정이 없으면 최신순이어야 한다'
);

// 고정은 항상 위 — 오래된 글이어도
assert.deepEqual(
  sortPosts([p('new', '2026-08-10'), p('old-pinned', '2026-08-01', true)]).map((x) => x.id),
  ['old-pinned', 'new'],
  '고정된 글은 더 최신 글보다 위여야 한다'
);

// 고정끼리도 최신순
assert.deepEqual(
  sortPosts([
    p('pin-old', '2026-08-01', true),
    p('plain', '2026-08-05'),
    p('pin-new', '2026-08-09', true),
  ]).map((x) => x.id),
  ['pin-new', 'pin-old', 'plain'],
  '고정끼리는 최신순이어야 한다'
);

// 원본 배열을 건드리지 않는다 — 호출한 쪽의 state를 제자리에서 뒤집으면 안 된다
const original = [p('a', '2026-08-01'), p('b', '2026-08-02')];
sortPosts(original);
assert.deepEqual(
  original.map((x) => x.id),
  ['a', 'b'],
  '원본 배열은 그대로여야 한다'
);

console.log('board.check.ts: 모든 검사 통과');
