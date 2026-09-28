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
// ── 2단계 — 공지도 글도 **그것을 편다** ───────────────────────────
// announcement  공지 탭을 열고 **그 공지를 편다.** 목적지가 행을 받는 모달이라
//               id로 목록에서 찾는다(createAnnouncement가 .select()로 돌려준다).
// mention·comment  게시판 탭을 열고 **그 글 카드를 편다**(2026-09-29에 붙였다).
//
// ⚠ **목적지의 모양이 둘이 다르다.**
//   공지 상세는 **모달**이라 부모가 행 하나를 쥐여주면 떴다.
//   글 상세는 **화면이 없다** — 본문·댓글이 PostCard 안에 인라인으로 펴지고,
//   여는 상태(showComments)가 카드마다 따로 있어 부모가 못 봤다.
//   그래서 상세 화면을 새로 만드는 대신 **카드에 신호를 내려보낸다**:
//
//       routeFor → openPostId → TeamHomeScreen → BoardPanel → PostCard(autoOpen)
//
//   글 상세 화면을 만드는 쪽(갈래 B)은 안 골랐다 — 카드·댓글·멘션·편집·고정이
//   전부 PostCard 안이라 통째로 옮기거나 두 벌이 되고, 목록↔상세에서 댓글 수·
//   좋아요가 갈린다. 얻는 것은 「스크롤이 필요 없다」 하나뿐이다.
//
// ⚠ **스크롤은 여전히 안 한다.** BoardPanel은 조상 ScrollView 안의 posts.map이라
//   FlatList가 아니고 scrollToIndex가 없다 — measureLayout으로 밀어야 한다.
//   카드가 펴지면 그 카드만 길어지므로 **펴진 것 자체가 표시**다.

/** 알림에 실려 오는 값. Edge Function의 messages[].data와 같은 모양이어야 한다. */
export interface NotificationData {
  kind?: string;
  /** 경기 알림 — ISO 문자열. id가 아니라 날짜다(위 주석) */
  matchDate?: string;
  settlementId?: string;
  /** 공지 알림 — 이건 id다. 목적지 모달이 행을 받아서 목록에서 찾아야 한다 */
  announcementId?: string;
  /** 언급·댓글 알림 — 게시판 목록에서 이 글 카드를 편다 */
  postId?: string;
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
    ⚠ id가 없으면(옛 알림) 그 칸까지만 간다 — 목록이 그 자체로 답이다.
      공지도 글도 같은 규칙이다.
  */
  if (screen === 'Team') {
    if (d.kind === 'announcement') {
      const id = typeof d.announcementId === 'string' ? d.announcementId : '';
      return { screen, params: id ? { tab: 'notices', openAnnouncementId: id } : { tab: 'notices' } };
    }
    const postId = typeof d.postId === 'string' ? d.postId : '';
    return { screen, params: postId ? { tab: 'board', openPostId: postId } : { tab: 'board' } };
  }
  return { screen };
}
