// src/features/team/components/TeamBoardTab.tsx
// 게시판 — 팀 탭의 board 화면.
//
// 한동안 진입점이 없었고 렌더 코드도 주석 상태였다. 그때 적어 둔 근거는 이랬다:
//
//     게시판 — 화면에서만 걷어냈다. 코드와 DB(posts·post_likes·post_comments·post_pins)는
//     그대로 둔다: 이미 쌓인 글이 있고, 되살릴 때 마이그레이션부터 다시 보게 되면
//     비용이 훨씬 크다. tab이 'board'가 되는 경로가 없어져서 이 줄은 지금 안 그려진다.
//
// 그 판단이 값을 했다. 레퍼런스가 게시판을 되살렸을 때 필요한 것이 **주석 두 줄**이었다 —
// 스키마도 서비스도 그대로 맞았고(posts에 title이 없다는 것 하나만 화면에서 다뤘다),
// 프로덕션에 글·댓글·고정이 그대로 있었다.
//
// 진입은 둘이다: 하단 4버튼의 「게시판」과 「최근 게시글」 카드의 「전체보기 ›」.
// 둘 다 setTab('board')로 간다.
import { BoardPanel } from '../../board/components/BoardPanel';

interface Props {
  teamId: string;
  myUserId: string;
  isAdmin: boolean;
  /** 언급·댓글 알림에서 넘어온 글 — 그 카드를 펴 준다 */
  openPostId?: string;
}

export function TeamBoardTab({ teamId, myUserId, isAdmin, openPostId }: Props) {
  // 한 줄로 둔다 — boardalive.check가 `return <BoardPanel`을 찾는다(꺼진 시절의 모양이 return null이었다)
  return <BoardPanel teamId={teamId} myUserId={myUserId} isAdmin={isAdmin} openPostId={openPostId} />;
}
