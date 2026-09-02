// src/dev/screenshotFixtures.ts — 스토어 스크린샷용 가짜 데이터
//
// ⚠ **릴리스에 절대 들어가면 안 된다.** 가드가 셋이고 셋 다 있어야 돈다:
//
//     ① __DEV__ 가 참       릴리스 번들에서는 false다 (Metro가 상수로 접어 없앤다)
//     ② EXPO_PUBLIC_SCREENSHOT === '1'
//     ③ 부르는 자리가 App.tsx 한 곳뿐이고 거기서도 같은 조건을 다시 본다
//
//   screenshot.check.ts가 셋을 붙든다 — 하나라도 풀리면 검사가 실패한다.
//   ⚠ 「__DEV__면 되겠지」로 끝내지 않은 이유: 개발 빌드로 시연하다가 켜진 채
//     남는 경로가 있다. 환경변수를 따로 두면 켜는 것이 언제나 의도적인 일이 된다.
//
// ── 왜 스토어에 직접 넣는가 ────────────────────────────────────────
// 화면을 한 줄도 안 고치려고 그런다. 픽스처를 위해 컴포넌트에 분기를 넣으면
// 그 분기가 릴리스에도 남고, 스크린샷이 끝나도 아무도 안 걷어낸다.
//
// ⚠ **로더도 같이 갈아 끼운다.** 값만 넣으면 화면이 마운트될 때 loadMatches()가
//   돌아 빈 데이터로 덮어쓴다. Zustand는 함수도 상태라 같이 넣을 수 있다.
//
// ── 게시판은 왜 없는가 ─────────────────────────────────────────────
// 게시글·댓글은 스토어가 아니라 BoardPanel의 지역 상태다(useState + fetchPosts).
// 넣으려면 서비스에 분기를 만들어야 하는데, 그건 **릴리스 코드에 픽스처가 닿는**
// 자리를 새로 만드는 일이다 — 이 파일이 피하려는 바로 그것이다.
// 스크린샷 여덟 장에 게시판이 없으므로 지금은 넣지 않는다. 넣기로 하면
// 서비스에 「대체 함수 슬롯」을 하나 두고 이 파일이 등록하는 방식이 맞다.

import { useAnnouncementsStore } from '../features/announcements/stores/announcementsStore';
import { useAttendanceStore } from '../features/attendance/stores/attendanceStore';
import { usePollsStore } from '../features/polls/stores/pollsStore';
import { useSettlementStore } from '../features/settlement/stores/settlementStore';
import { useTeamStore } from '../features/team/stores/teamStore';

const TEAM_ID = 'fx-team';
const NOOP = async () => {};

/** 오늘 기준으로 며칠 뒤/전 20시 */
const at = (days: number, hhmm = '20:00') => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

/* ── 멤버 여덟 ────────────────────────────────────────────────────
   포지션을 골고루 둔다 — 팀 분배 화면이 네 자리를 다 채워야 그럴듯하다.
   실력도 상·중·하가 섞여야 「균형을 맞춘다」가 보인다. */
const M = [
  { n: '김도현', p: 'pivo', s: 3, j: 10, r: 'admin' as const },
  { n: '박준서', p: 'ala', s: 2, j: 7 },
  { n: '이지훈', p: 'fixo', s: 3, j: 4 },
  { n: '최민재', p: 'goleiro', s: 2, j: 1 },
  { n: '정우성', p: 'ala', s: 1, j: 23 },
  { n: '한서준', p: 'pivo', s: 2, j: 9 },
  { n: '오현우', p: 'fixo', s: 1, j: 15 },
  { n: '윤태경', p: 'ala', s: 3, j: 11 },
];

const members = M.map((m, i) => ({
  id: `fx-m${i}`,
  userId: `fx-u${i}`,
  role: m.r ?? ('member' as const),
  skillTag: m.s as 1 | 2 | 3,
  position: m.p,
  jerseyNumber: m.j,
  joinedAt: at(-180),
  notifyMatch: true,
  notifyAnnouncement: true,
  notifyBoard: true,
  notifySettlement: true,
  displayName: m.n,
  avatarUrl: null,
  phone: null,
  dominantFoot: i % 3 === 0 ? 'right' : i % 3 === 1 ? 'left' : 'both',
}));

/** 나 = 총무. 스크린샷은 총무 시점이 정보가 제일 많다 */
const ME = members[0];

const team = {
  id: TEAM_ID,
  name: '강남 FC',
  invite_code: 'GNFC24',
  home_place_name: '강남 풋살파크',
  home_address: '서울 강남구 논현로 152',
  home_latitude: 37.5109,
  home_longitude: 127.0223,
  slogan: '수요일 저녁, 강남에서 뜁니다',
  logo_url: null,
  region_code: '11680',
  region_label: '서울 강남구',
  avg_headcount: 12,
  skill_level: 'intermediate' as const,
  open_to_match: true,
  created_by: ME.userId,
  created_at: at(-180),
};

/* ── 경기 ─────────────────────────────────────────────────────────
   다가오는 둘 + 지난 넷. 지난 경기가 있어야 참석률이 「-」가 아니라 숫자로 나온다. */
const mkMatch = (
  id: string,
  date: string,
  where: string,
  status: 'scheduled' | 'finished',
  capacity = 12
) => ({
  id,
  team_id: TEAM_ID,
  match_date: date,
  location: where,
  address: '서울 강남구 논현로 152',
  latitude: 37.5109,
  longitude: 127.0223,
  place_category: '풋살장',
  vote_deadline: status === 'scheduled' ? at(-0.5) : null,
  status,
  quarter_minutes: 10,
  team_count: 2,
  capacity,
  venue_id: null,
  location_pending: false,
  match_type: null,
  created_by: ME.userId,
  created_at: at(-30),
});

/** 참석 여덟 중 정원 6 → 둘이 대기자가 된다 */
const votesFor = (matchId: string, statuses: (0 | 1 | 2 | 3)[]) =>
  statuses
    .map((st, i) =>
      st === 0
        ? null
        : {
            id: `${matchId}-v${i}`,
            match_id: matchId,
            team_member_id: members[i].id,
            status: (['pending', 'attend', 'absent', 'undecided'] as const)[st],
            updated_at: at(-1),
          }
    )
    .filter((v): v is NonNullable<typeof v> => !!v);

/*
  ⚠ **지난 경기 둘은 이번 달 안이어야 한다.**
  「이번 달 참석률」은 이번 달의 **이미 치른** 경기만 센다(attendanceRate.ts).
  「며칠 전」으로만 잡으면 달 초에 전부 지난달로 넘어가 참석률이 「-」가 된다 —
  처음 만들었을 때 실제로 그렇게 나왔다.
*/
const pastThisMonth = (back: number, hhmm: string) => {
  const now = new Date();
  const d = new Date(now);
  d.setDate(now.getDate() - Math.min(back, Math.max(0, now.getDate() - 1)));
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  /* 달 1일이라 오늘로 접혔으면 아침으로 — 「이미 치른」이 되어야 센다 */
  if (d.getTime() > now.getTime()) d.setHours(7, 0, 0, 0);
  return d.toISOString();
};

const matches = [
  /* 이번 주 — 정원 6에 참석 7이라 하나가 대기다. 미투표 하나가 남아 독촉이 산다 */
  { ...mkMatch('fx-1', at(2), '강남 풋살파크 A구장', 'scheduled', 6),
    votes: votesFor('fx-1', [1, 1, 1, 1, 1, 1, 1, 0]) },
  /* 다음 주 — 아직 갈리는 중 */
  { ...mkMatch('fx-2', at(9), '역삼 풋살스타디움', 'scheduled'),
    votes: votesFor('fx-2', [1, 1, 3, 2, 1, 0, 1, 3]) },
  /* 이번 달에 치른 둘 — 참석률의 분자·분모가 여기서 나온다 */
  { ...mkMatch('fx-p0', pastThisMonth(1, '20:00'), '강남 풋살파크 A구장', 'finished'),
    votes: votesFor('fx-p0', [1, 1, 1, 2, 1, 1, 1, 1]) },
  /* ⚠ 시간을 다르게 둔다. 달 초에는 위 클램프 때문에 둘이 같은 날로 접히는데,
     그때 시간까지 같으면 카드 둘이 똑같아 보인다(9월 2일에 실제로 그랬다) */
  { ...mkMatch('fx-p1', pastThisMonth(2, '17:00'), '역삼 풋살스타디움', 'finished'),
    votes: votesFor('fx-p1', [1, 1, 1, 1, 2, 1, 2, 1]) },
  /* 지난달 둘 — 「지난 정산」 목록이 비어 보이지 않게 */
  ...[35, 42].map((d, i) => ({
    ...mkMatch(`fx-p${i + 2}`, at(-d), i % 2 ? '역삼 풋살스타디움' : '강남 풋살파크 A구장', 'finished'),
    votes: votesFor(`fx-p${i + 2}`, [1, 1, 1, 2, 1, 1, 2, 1]),
  })),
];

/* ── 정산 ─────────────────────────────────────────────────────────
   진행 중 하나. 참석 7명 × 9,000원. 셋이 아직 안 냈고 그중 하나는 「확인 대기」다. */
const PER = 9000;
const shares = [0, 1, 2, 3, 4, 5, 6].map((i) => ({
  id: `fx-s${i}`,
  teamMemberId: members[i].id,
  guestName: null,
  name: members[i].displayName,
  amount: PER,
  exempt: false,
  markedPaid: i === 4,
  markedPaidAt: i === 4 ? at(-0.2) : null,
  paid: i < 4,
  isMe: i === 0,
}));

const current = {
  id: 'fx-st1',
  matchId: 'fx-p0',
  totalAmount: PER * 7,
  perPerson: PER,
  surplus: 0,
  memo: '구장비 + 음료',
  bankName: '토스뱅크',
  accountNo: '100012345678',
  accountHolder: '김도현',
  status: 'open' as const,
  createdAt: at(-6),
  dueDate: at(1),
  shares,
};

const past = [1, 2].map((i) => ({
  ...current,
  id: `fx-st${i + 1}`,
  matchId: `fx-p${i}`,
  status: 'done' as const,
  createdAt: at(-7 * (i + 2)),
  dueDate: null,
  memo: '구장비',
  shares: shares.map((s) => ({ ...s, paid: true, markedPaid: true })),
}));

/* ── 공지 ─────────────────────────────────────────────────────────
   실제 팀이 쓸 법한 문구로. 하나는 고정. */
const announcements = [
  {
    id: 'fx-a1',
    team_id: TEAM_ID,
    author_id: ME.userId,
    title: '9월 회비 안내',
    body: '이번 달 구장비는 1인 9,000원이에요. 정산 탭에서 확인하고 보내주세요.',
    is_pinned: true,
    created_at: at(-3),
    updated_at: at(-3),
  },
  {
    id: 'fx-a2',
    team_id: TEAM_ID,
    author_id: ME.userId,
    title: '수요일 구장이 A구장으로 바뀝니다',
    body: 'B구장 보수 공사로 이번 주부터 A구장에서 합니다. 주차는 지하 2층에 하세요.',
    is_pinned: false,
    created_at: at(-6),
    updated_at: at(-6),
  },
  {
    id: 'fx-a3',
    team_id: TEAM_ID,
    author_id: ME.userId,
    title: '신입 두 분 오셨어요',
    body: '정우성님, 오현우님 반갑습니다. 처음 오시는 분은 20분 전에 도착해주세요.',
    is_pinned: false,
    created_at: at(-12),
    updated_at: at(-12),
  },
];

const polls = [
  {
    id: 'fx-poll1',
    team_id: TEAM_ID,
    author_id: ME.userId,
    question: '다음 달 정기전, 어느 요일이 좋으세요?',
    options: ['수요일 20시', '금요일 20시', '토요일 오전'],
    deadline: at(4),
    created_at: at(-2),
    responses: [
      { id: 'fx-r1', poll_id: 'fx-poll1', team_member_id: members[1].id, option_index: 0, created_at: at(-2) },
      { id: 'fx-r2', poll_id: 'fx-poll1', team_member_id: members[2].id, option_index: 0, created_at: at(-2) },
      { id: 'fx-r3', poll_id: 'fx-poll1', team_member_id: members[3].id, option_index: 1, created_at: at(-1) },
      { id: 'fx-r4', poll_id: 'fx-poll1', team_member_id: members[4].id, option_index: 2, created_at: at(-1) },
    ],
  },
];

/**
 * 스토어를 픽스처로 채우고 로더를 막는다.
 *
 * ⚠ 부르는 쪽(App.tsx)이 조건을 이미 봤더라도 **여기서 다시 본다.**
 *   가드가 한 곳에만 있으면 다른 데서 부르는 순간 새어 나간다.
 */
export function applyScreenshotFixtures(): boolean {
  if (!__DEV__ || process.env.EXPO_PUBLIC_SCREENSHOT !== '1') return false;

  const membership = { membershipId: ME.id, role: 'admin' as const, team };

  useTeamStore.setState({
    memberships: [membership],
    activeTeam: membership,
    members: members as never,
    loaded: true,
    loading: false,
    error: null,
    loadMemberships: NOOP,
    loadMembers: NOOP,
  });

  useAttendanceStore.setState({
    matches: matches as never,
    loaded: true,
    loading: false,
    error: null,
    loadMatches: NOOP,
  });

  useSettlementStore.setState({
    current: current as never,
    past: past as never,
    pendingMatches: [
      /* 정산 탭의 두 갈래(진행중·미등록)가 둘 다 보이게 하나 둔다.
         ⚠ 제목을 손으로 적지 않는다 — 달이 바뀌면 날짜와 어긋난다 */
      (() => {
        const d = new Date(at(-42));
        return {
          matchId: 'fx-p3',
          matchDate: d.toISOString(),
          title: `${d.getMonth() + 1}월 ${d.getDate()}일 경기`,
          where: '20:00 · 역삼 풋살스타디움',
          attendCount: 7,
          daysSince: 42,
        };
      })(),
    ],
    loaded: true,
    loading: false,
    error: null,
    load: NOOP,
  });

  useAnnouncementsStore.setState({
    announcements: announcements as never,
    loaded: true,
    loading: false,
    error: null,
    loadAnnouncements: NOOP,
  });

  usePollsStore.setState({
    polls: polls as never,
    loaded: true,
    loading: false,
    error: null,
    loadPolls: NOOP,
  });

  return true;
}
