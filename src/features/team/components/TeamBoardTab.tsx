// src/features/team/components/TeamBoardTab.tsx
// 게시판 — 팀 탭의 board 화면.
//
// ⚠ 현재 진입점이 없고, 렌더 코드도 주석 상태 그대로다.
//   TeamHomeScreen에 있던 주석을 옮겨 적는다:
//
//     게시판 — 화면에서만 걷어냈다. 코드와 DB(posts·post_likes·post_comments·post_pins)는
//     그대로 둔다: 이미 쌓인 글이 있고, 되살릴 때 마이그레이션부터 다시 보게 되면
//     비용이 훨씬 크다. tab이 'board'가 되는 경로가 없어져서 이 줄은 지금 안 그려진다.
//
//   그래서 이 파일도 아무것도 그리지 않는다. 주석을 풀고 BoardPanel을 살리면
//   되살아난다 — 되살릴 때 여기 한 곳만 보면 되도록 모아 둔 것이 이 파일의 목적이다.
//
// TeamHomeScreen에서 갈라져 나왔다. 주석을 푸는 것 외에 옮기면서 바꾼 것은 없다.

// import { BoardPanel } from '../../board/components/BoardPanel';

interface Props {
  teamId: string;
  myUserId: string;
  isAdmin: boolean;
}

export function TeamBoardTab(_props: Props) {
  /*
  return <BoardPanel teamId={_props.teamId} myUserId={_props.myUserId} isAdmin={_props.isAdmin} />;
  */
  return null;
}
