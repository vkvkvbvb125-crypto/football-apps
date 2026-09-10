// src/features/notifications/notificationRoute.ts
//
// 알림의 data를 「어느 탭으로, 무슨 파라미터로」로 바꾼다.
//
// 순수 함수로 둔 이유는 시험 때문만이 아니다. 이 판단은 **틀리면 사용자를 엉뚱한
// 화면으로 데려간다** — 알림이 데려다주지 못하는 것보다 나쁘다. 화면 코드 안에
// 있으면 눌러보는 것 말고 확인할 방법이 없다.
//
// ── 목적지가 요구하는 것은 id가 아니다 ──────────────────────────────
// 일정 화면은 matchId가 아니라 **focusDate**를 받는다(AttendanceScreen:275).
// 이게 판을 바꾼다 — 경기를 만드는 자리 둘(attendanceStore)은 insert 결과를
// 버려서 matchId가 손에 없는데, matchDate는 입력값이라 항상 있다.
// 「id를 실어야 한다」로 시작했으면 그 둘은 라우팅을 못 붙일 뻔했다.
//
// ── 2단계 — 공지는 펴고, 글은 목록까지 ─────────────────────────────
// announcement  공지 탭을 열고 **그 공지를 편다.** 목적지가 행을 받는 모달이라
//               id로 목록에서 찾는다(createAnnouncement가 .select()로 돌려준다).
// mention·comment  **게시판 탭까지** 간다. 그 글로 스크롤하지 않는다 — 아래 참고.
//
// ⚠ **「그 글로 스크롤」을 하지 않는 근거.**
//   글 상세 화면이 **존재하지 않는다.** BoardPanel이 posts.map으로 PostCard를
//   그대로 늘어놓고, 본문·댓글이 그 카드 안에 인라인이다. FlatList도 아니라
//   scrollToIndex도 없다 — 조상 ScrollView를 참조해 measureLayout으로 밀어야 한다.
//
//   그리고 **앱 자신이 이미 「그 글로 간다」를 「목록을 연다」로 하고 있다.**
//   팀 홈의 「최근 게시글」에서 개별 글 행을 눌러도 onGoTile('board')뿐이다
//   (TeamHomeTab). 알림만 다르게 만들면 같은 행동이 두 곳에서 다르게 끝난다 —
//   바꾸려면 그 자리도 같이 바꿔야 하고, 그래서 얻는 것은 「목록 맨 위 대신
//   세 번째 글에 선다」뿐이다. 값이 안 맞는다.
//
// ⚠ 그래서 mention·comment에는 target이 없다. 목적지가 목록이라 id가 필요 없고,
//   createPost에 .select()를 붙일 이유도 없다. 스크롤을 하기로 하면 그때 붙인다.

/** 알림에 실려 오는 값. Edge Function의 messages[].data와 같은 모양이어야 한다. */
export interface NotificationData {
  kind?: string;
  /** 경기 알림 — ISO 문자열. id가 아니라 날짜다(위 주석) */
  matchDate?: string;
  settlementId?: string;
  /** 공지 알림 — 이건 id다. 목적지 모달이 행을 받아서 목록에서 찾아야 한다 */
  announcementId?: string;
}

/** 어느 탭으로 갈지와 그 탭에 넘길 파라미터. */
export interface RouteIntent {
  screen: 'Attendance' | 'Settlement' | 'Team';
  params?: Record<string, string>;
}

/*
  kind → 탭. 여덟 종류를 넷으로 접은 알림 설정 토글과 같은 묶음이 아니다 —
  저기는 「무엇을 끌 것인가」이고 여기는 「어디로 갈 것인가」라 축이 다르다.
  실제로 weather와 new_match는 토글이 같지만 여기서도 같고,
  mention과 comment도 토글이 같고 여기서도 같다. 지금은 겹치지만
  묶음이 같아서가 아니라 우연이니 따로 적는다.
*/
const KIND_SCREEN: Record<string, RouteIntent['screen']> = {
  new_match: 'Attendance',
  deadline: 'Attendance',
  weather: 'Attendance',
  settlement: 'Settlement',
  announcement: 'Team',
  mention: 'Team',
  comment: 'Team',
};

/**
 * 알림 data에서 갈 곳을 정한다. 갈 곳이 없으면 null.
 *
 * ⚠ **null이 정상 결과다.** 다음 셋이 전부 null이고, 그때 하는 일은
 *   「아무 데도 안 간다」이지 「홈으로 보낸다」가 아니다:
 *     · kind가 없는 옛 알림 (이 커밋 전에 보낸 것 전부)
 *     · 모르는 kind (나중에 종류를 늘렸는데 앱이 옛 버전인 경우)
 *     · data 자체가 없는 알림
 *
 *   홈으로 보내면 더 나쁘다. 홈은 앱을 열면 나오는 곳이라 정보가 0인데,
 *   사용자가 보던 화면을 빼앗는 손해는 그대로 남는다.
 *   「안 데려다준다」와 「엉뚱한 데로 데려간다」 중 앞이 낫다.
 */
export function routeFor(data: unknown): RouteIntent | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as NotificationData;
  if (typeof d.kind !== 'string') return null;

  const screen = KIND_SCREEN[d.kind];
  if (!screen) return null;

  /*
    파라미터는 있으면 싣고 없으면 탭까지만 간다.
    ⚠ 값이 있어도 「그 대상이 아직 있는가」는 보지 않는다 — 여기서 볼 수 없고,
      목적지가 이미 안전하게 처리한다:
        focusDate         id를 안 보므로 지워진 경기여도 그냥 빈 날짜가 펴진다
        openSettlementId  목록에 없으면 모달이 안 뜬다(detailTarget만 세운다)
  */
  if (screen === 'Attendance' && typeof d.matchDate === 'string' && d.matchDate) {
    return { screen, params: { focusDate: d.matchDate } };
  }
  if (screen === 'Settlement' && typeof d.settlementId === 'string' && d.settlementId) {
    return { screen, params: { openSettlementId: d.settlementId } };
  }
  /*
    팀 탭은 안에 화면이 넷이라(홈·멤버·공지·게시판) 탭만으로는 아직 목적지가 아니다.
    kind마다 어느 칸인지가 정해져 있으므로 여기서 같이 싣는다.
    ⚠ 공지 id가 없으면(옛 알림) 공지 칸까지만 간다 — 목록이 그 자체로 답이다.
  */
  if (screen === 'Team') {
    if (d.kind === 'announcement') {
      const id = typeof d.announcementId === 'string' ? d.announcementId : '';
      return { screen, params: id ? { tab: 'notices', openAnnouncementId: id } : { tab: 'notices' } };
    }
    return { screen, params: { tab: 'board' } };
  }
  return { screen };
}
