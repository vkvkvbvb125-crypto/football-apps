// src/theme.ts — 홈 리디자인 디자인 토큰
// Claude Design(리디자인 산출물)에서 쓰인 값을 그대로 옮긴 것. 화면 코드에서
// 하드코딩된 색/크기를 이 파일로 점진적으로 교체해 나가면 됩니다.

export const colors = {
  // 배경
  bgRoot: '#07100D',
  bgScreen: '#0F1512',
  card: '#111A16',
  cardAlt: '#0D1512',
  inputBg: '#0C1310',

  /**
   * 배경에서 떠 보이는 카드 — 팀 화면에서 먼저 쓴다(다른 화면은 아직 card).
   *
   * 기존 card(#111A16)는 bgRoot 대비가 1.08:1이라 사실상 같은 색이었다. 카드가 배경에서
   * 분리되지 않으니 화면이 검은 판 하나로 읽혔다. 1.45:1로 올려 경계를 눈이 잡게 한다.
   */
  cardRaised: '#24352D',

  // 테두리
  border: '#1E2A25',
  /** cardRaised 위에서 실제로 보이는 테두리 (카드 대비 1.4:1). 기존 border는 1.2:1이라 안 보였다 */
  borderRaised: '#354C40',
  borderSoft: '#161F1B',
  divider: '#1B2521',

  // 강조
  green: '#4ADE80',
  greenNav: '#35F58A',
  navIdle: '#7C8A85',
  greenTimer: '#50D978',
  greenDeep: '#2F4A3A',
  greenTint: 'rgba(74,222,128,0.10)',
  greenTrack: '#173A28',

  // 텍스트
  text: '#FFFFFF',
  textStrong: '#E7ECE9',
  textBody: '#C9D3CF',
  textMuted: '#8A9490',
  textDim: '#6F7B76',
  textFaint: '#5F6B66',
  placeholder: '#5A625E',

  // 상태
  danger: '#F87171',
  gold: '#D2A34C',
  blue: '#60A5FA',
  neutralFill: '#3A4842',
  dangerTint: 'rgba(248,113,113,0.14)', // 삭제 같은 되돌릴 수 없는 동작
  goldTint: 'rgba(210,163,76,0.14)', // 확인 대기 배지
  neutralTint: 'rgba(58,72,66,0.28)', // 취소 배지

  // 예외 — 브랜드 고정색. 로그인 버튼과 공유 버튼이 같은 값을 봐야 마크가 어긋나지 않는다
  kakao: '#FEE500',
  kakaoText: '#000000',
} as const;

export const radius = {
  tile: 16,
  card: 18,
  hero: 20,
  button: 14,
  pill: 999,
  chip: 8,
} as const;

export const space = [0, 4, 6, 8, 10, 12, 14, 16, 20, 24] as const;

/**
 * 떠 있는 탭바의 높이와 화면 하단에서 띄운 간격.
 * MainTabNavigator(바를 그리는 쪽)와 useTabBarPadding(그만큼 여백을 두는 쪽)이
 * 같은 값을 봐야 한다 — 따로 두면 바 높이를 바꿀 때 콘텐츠가 다시 가려진다.
 */
export const tabBar = { height: 66, gap: 10 } as const;

export const font = {
  hero: { fontSize: 26, fontWeight: '800' as const, letterSpacing: -0.8 },
  // 정산 금액 전용 — 카드에서 가장 큰 요소라 hero(26)를 재사용하면
  // 배너 로고와 같은 위계가 되어 둘 다 약해진다.
  amount: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -1.0 },
  screenTitle: { fontSize: 21, fontWeight: '800' as const, letterSpacing: -0.4 },
  section: { fontSize: 15, fontWeight: '800' as const, letterSpacing: -0.2 },
  cardTitle: { fontSize: 14, fontWeight: '700' as const },
  body: { fontSize: 13, fontWeight: '500' as const },
  meta: { fontSize: 12, fontWeight: '600' as const },
  label: { fontSize: 11, fontWeight: '700' as const },
  num: { fontVariant: ['tabular-nums'] as const },
} as const;

// 그림자: 웹 box-shadow 대신 (iOS/Android 공통으로 쓰려면 이 객체를 spread)
export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;
