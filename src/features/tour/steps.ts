// src/features/tour/steps.ts — 무엇을 짚고 뭐라고 말하는가
//
// ⚠ **「할 수 있는 것」이 아니라 「지금 할 일」 순서다.** 기능 목록을 읊으면
//   다 듣고 나서도 뭘 먼저 눌러야 하는지 모른다. 총무의 하루, 팀원의 하루 순서로 짠다.
//
// ⚠ 문구가 약속하는 경로가 실제로 있는지 확인하고 적었다. 근거는 각 단계 주석에 있다.
//   없는 경로를 적으면 그 말이 사람을 막다른 곳으로 보낸다(AGENTS.md 「빈 상태」 절).

/** 짚을 자리의 이름. 화면이 이 이름으로 ref를 등록한다 */
export type TourTarget =
  | 'tab.attendance'
  | 'tab.assignment'
  | 'tab.settlement'
  | 'home.matchCard'
  | 'home.rosterButton'
  | 'attendance.create'
  | 'settlement.markPaid';

export interface TourStep {
  target: TourTarget | null;
  title: string;
  body: string;
  /** 이 단계를 보려면 여기에 있어야 한다 — 다른 탭이면 먼저 옮긴다 */
  screen?: 'Home' | 'Attendance' | 'Settlement';
}

/*
  총무 — 팀을 만든 사람. 혼자인 상태로 시작한다.

  ⚠ 「초대」를 1번에 넣지 않았다. 팀 홈에 초대 카드가 이미 조건 없이 늘 그려지고,
    TeamStartScreen 직후 화면이 팀 탭이 아니라 홈이다. 초대를 짚으려면 탭을 옮겨야
    하는데, 첫 단계부터 화면을 끌고 다니면 「내가 뭘 누른 거지」가 된다.
    대신 마지막에 한 번 말로만 남긴다.
*/
export const ADMIN_STEPS: TourStep[] = [
  {
    /* AttendanceScreen이 이 탭이다. 빈 상태가 「날짜를 고르고 첫 경기를 만들어
       보세요 · 만들면 팀원에게 참석 투표가 열려요」로 같은 말을 한다 — 이어진다 */
    target: 'tab.attendance',
    screen: 'Home',
    title: '경기는 여기서 만들어요',
    body: '날짜를 고르고 시간과 구장을 넣으면 끝이에요. 만들면 팀원에게 참석 투표가 열립니다.',
  },
  {
    target: 'attendance.create',
    screen: 'Attendance',
    title: '이 버튼으로 만듭니다',
    body: '달력에서 날짜를 먼저 고르고 눌러요. 정원과 투표 마감도 여기서 정합니다.',
  },
  {
    /*
      ⚠ **대상이 없다. 일부러 null이다.**

      「참여 현황 보기」를 짚으려 했는데, 그 버튼은 `HomeScreen:605`의
      `{next && matchDate && (` 안에 있다 — **경기가 있어야 그려진다.**
      그런데 이 튜토리얼이 도는 시점은 팀을 **막 만든 직후**라 경기가 0이다.
      기기에서 확인했다: 홈에 「예정된 경기가 없습니다」가 떠 있고 그 버튼은 없다.

      존재할 수 없는 것을 짚으면 구멍이 안 뚫리고 설명만 남는데, 그때 문구가
      현재형이면 「어디 있다는 거지」가 된다. 그래서 **문구를 미래형으로** 바꿨다.
      경기를 만들고 나면 그 카드에 실제로 생기는 버튼이라 예고가 맞다.

      ⚠ 대상을 억지로 다른 것으로 바꾸지 마라. 이 단계가 말하는 것은
        「누가 오는지 보는 자리가 있다」이고, 그 자리는 경기가 있어야 존재한다.
    */
    target: null,
    screen: 'Home',
    title: '누가 오는지는 경기 카드에서',
    body: '경기를 만들면 홈에 그 경기 카드가 뜨고, 「참여 현황 보기」로 참석·불참·미정이 한 화면에 모여요. 아직 안 고른 사람에게는 독촉 알림도 보낼 수 있습니다.',
  },
  {
    /* 가운데 탭. ScoreboardPanel의 「경기 종료 → 정산으로」가 정산 생성으로 이어진다 */
    target: 'tab.assignment',
    screen: 'Home',
    title: '경기 당일에는 여기를',
    body: '타이머와 점수, 실력으로 나눈 두 팀. 「경기 종료」를 누르면 그대로 정산으로 넘어갑니다.',
  },
  {
    target: 'tab.settlement',
    screen: 'Home',
    title: '회비는 자동으로 나눠요',
    body: '총 금액만 넣으면 1인당 금액이 계산됩니다. 누가 냈고 누가 안 냈는지 한 화면에서 보여요.\n\n팀원은 팀 탭의 초대 코드로 부르면 됩니다.',
  },
];

/*
  팀원 — 초대 코드로 들어온 사람. 팀에 데이터가 이미 있을 수도 없을 수도 있다.

  ⚠ 3번이 이 코스에서 제일 중요하다. 송금하고 「입금했어요」를 안 누르면
    총무 쪽에서는 미납으로 남고, 그러면 독촉 알림이 간다.
*/
export const MEMBER_STEPS: TourStep[] = [
  {
    target: 'home.matchCard',
    screen: 'Home',
    title: '참석 여부만 고르면 돼요',
    body: '다음 경기가 여기 뜹니다. 참석·불참·미정 중에 고르면 끝이에요. 정원이 차면 대기로 들어갑니다.',
  },
  {
    target: 'tab.settlement',
    screen: 'Home',
    title: '내 회비는 여기서',
    body: '얼마를 내야 하는지 보이고, 토스·카카오뱅크·KB·신한은 계좌와 금액이 채워진 화면으로 바로 넘어가요.',
  },
  {
    /*
      ⚠ **이 자리는 정산이 있어야 존재한다.** 「입금했어요」는 정산 상세 안에 있어서,
        갓 들어온 팀원에게는 없다. 그때는 TourProvider가 구멍 없이 문구만 띄운다.
        총무 3단계와 달리 문구를 미래형으로 안 바꾼 것은, 이 문장이 「여기를 봐라」가
        아니라 **규칙**이라 정산이 없을 때 읽어도 말이 되기 때문이다.
      ⚠ 계정 둘이 필요해서 기기로는 아직 못 봤다 — 서랍 「확인 필요」에 있다.
    */
    target: 'settlement.markPaid',
    screen: 'Settlement',
    title: '보냈으면 꼭 눌러주세요',
    body: '송금한 뒤 「입금했어요」를 눌러야 총무가 압니다. 안 누르면 미납으로 남아 독촉 알림이 갈 수 있어요.',
  },
];

export const stepsFor = (role: 'admin' | 'member') => (role === 'admin' ? ADMIN_STEPS : MEMBER_STEPS);
