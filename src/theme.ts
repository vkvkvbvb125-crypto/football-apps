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

  // 테두리
  border: '#1E2A25',
  borderSoft: '#161F1B',
  divider: '#1B2521',

  // 강조
  green: '#4ADE80',
  greenNav: '#35F58A',
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

  // 예외
  kakao: '#FEE500',
  kakaoText: '#3C1E1E',
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

export const font = {
  hero: { fontSize: 26, fontWeight: '800' as const, letterSpacing: -0.8 },
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
