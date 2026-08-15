// src/theme.ts — 홈 리디자인 디자인 토큰
// Claude Design(리디자인 산출물)에서 쓰인 값을 그대로 옮긴 것. 화면 코드에서
// 하드코딩된 색/크기를 이 파일로 점진적으로 교체해 나가면 됩니다.

/**
 * 면은 무채색, 초록은 아껴서.
 *
 * 예전엔 배경·카드·테두리까지 전부 초록기가 돌았다. 초록이 흔해지니 정작 강조해야 할
 * 것(활성 탭·주요 버튼·핵심 숫자)이 묻혔고, 화면 전체가 탁하게 읽혔다.
 * 면에서 색을 빼면 남은 초록 몇 개가 저절로 눈에 꽂힌다.
 */
export const colors = {
  /*
   * 세 번 헤맨 끝의 값이다. 기록해 둔다.
   *
   *   #07100D  초록기 도는 순검정 → "밋밋하다"
   *   #0C0C0D  무채색 순검정      → "너무 꺼멓다"
   *   #1A1A20  무채색 어두운 회색  → "너무 회색이다"
   *
   * 밝기와 색기는 따로 놀았다. 순검정 근처에서는 면이 구분되지 않고, 색기를 0으로
   * 만들면 같은 밝기라도 죽은 회색으로 읽힌다. 그래서 밝기는 위 둘의 중간,
   * 색기는 아주 옅은 초록으로 되돌린다 — 처음의 탁한 초록과는 다르다.
   * 그때는 배경 전체가 초록이었고, 지금은 회색이 초록 쪽으로 살짝 기울 뿐이다.
   */
  bgRoot: '#0F1411',
  bgScreen: '#161D18',
  card: '#18201B',
  cardAlt: '#151B17',
  inputBg: '#141A16',

  /** 배경에서 한 겹 떠 있는 면 (배너처럼 화면의 앵커가 되는 자리) */
  cardRaised: '#1E2822',

  // 테두리 — 면 위에서 실제로 보이는 정도까지만
  border: '#2C3830',
  borderRaised: '#35443B',
  borderSoft: '#232C27',
  divider: '#28322C',

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
