// src/features/board/utils/sort.ts
// 게시판 정렬 — 게시판 목록과 팀 홈의 "최근 게시글"이 같은 순서를 보여야 한다.
// 화면마다 정렬하면 한쪽만 고쳐지는 날이 온다.
//
// react-native를 import하지 않는다 — scripts/board.check.ts가 node로 직접 불러 검증한다.

export interface SortablePost {
  isPinned: boolean;
  createdAt: string;
}

/** 고정 먼저, 그 안에서 최신순. 원본은 건드리지 않는다 */
export function sortPosts<T extends SortablePost>(posts: T[]): T[] {
  return [...posts].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}
