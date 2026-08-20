// src/components/BentoCard.tsx — 벤토 격자용 카드
//
// 카드마다 아주 옅은 그라디언트를 깔 수 있다. 세기는 한 자리에서만 정한다 —
// 카드마다 알파를 따로 정하면 어떤 카드는 튀고 어떤 카드는 안 보인다.
//
// 카드 틴트는 초록 하나로 통일했다.
//
// 예전 규칙은 "색이 분류를 따라간다"(경기=초록, 돈=금, 글=파랑)였는데, 실제 화면에서는
// 분류가 아니라 얼룩으로 읽혔다 — 홈을 위에서 아래로 내려가면 초록 카드, 금색 카드,
// 파란 카드가 차례로 나와서 한 화면이 세 앱처럼 보였다. 게다가 금색은 앱의 다른 곳에서
// 「확인 대기」, 파랑은 정보성 표시라 뜻이 겹쳤다.
//
// 무엇에 관한 카드인지는 제목과 아이콘이 이미 말한다. 틴트는 카드를 배경에서 띄우는
// 역할만 남긴다. gold·blue·danger는 지금 쓰는 곳이 없지만, 되돌리거나 경고 카드에
// 쓸 여지가 있어 남겨 둔다.
import type { ReactNode } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, shadow } from '../theme';

/**
 * 그라디언트 세기. 0.10을 넘기면 카드가 배경에서 뜨는 게 아니라 색칠한 것처럼 보인다.
 * 0.05 아래로 내리면 어두운 화면에서 아예 안 보인다.
 */
const TINT_TOP = 0.09;
const TINT_MID = 0.03;

export type BentoTone = 'plain' | 'green' | 'gold' | 'blue' | 'danger';

const TONE_RGB: Record<Exclude<BentoTone, 'plain'>, string> = {
  green: '34,197,94',
  gold: '210,163,76',
  blue: '96,165,250',
  danger: '248,113,113',
};

interface BentoCardProps {
  children: ReactNode;
  /** 무엇에 관한 카드인가 — 색이 분류를 따라간다 */
  tone?: BentoTone;
  /** 격자에서 반 칸을 차지 (기본은 한 줄 전체) */
  half?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * 카드 위에 까는 옅은 그라디언트. 왼쪽 위에서 오른쪽 아래로 흐른다 —
 * 빛이 한 방향에서 온 것처럼 보이도록 화면의 모든 카드가 같은 방향을 쓴다.
 * 카드 컴포넌트가 여럿이라(BentoCard, 홈의 SectionCard) 밖으로 뺐다.
 */
export function SoftTint({ tone, radius: r }: { tone: BentoTone; radius?: number }) {
  if (tone === 'plain') return null;
  const rgb = TONE_RGB[tone];
  return (
    <LinearGradient
      /*
       * 방향과 감쇠는 홈 히어로 카드와 같다 — 우상단에서 시작해 좌하단으로 흐르고
       * 60% 지점에서 사라진다. 세기만 다르다(히어로 0.45 / 여기 0.09).
       *
       * 예전엔 좌상단에서 시작했다. 한 화면 안에서 히어로는 오른쪽, 카드들은 왼쪽,
       * 그림자는 바로 위 — 조명이 세 방향이라 세기와 무관하게 어긋나 보였다.
       * 방향을 맞추면 세기 차이가 "제각각"이 아니라 위계로 읽힌다.
       *
       * 마지막 스톱을 투명 검정이 아니라 투명 초록으로 둔다 — 검정으로 빼면
       * 렌더러에 따라 중간이 탁하게 섞인다.
       */
      colors={[`rgba(${rgb},${TINT_TOP})`, `rgba(${rgb},${TINT_MID})`, `rgba(${rgb},0)`]}
      locations={[0, 0.3, 0.6]}
      start={{ x: 0.9, y: 0.05 }}
      end={{ x: 0.05, y: 1 }}
      /*
       * 반경은 부모의 overflow:'hidden'이 아니라 여기서 직접 받는다.
       *
       * 이건 absoluteFill 사각형이라 둥근 카드 위에 그냥 얹으면 모서리 밖으로 샌다.
       * 부모에 overflow를 걸어 막을 수도 있지만, 그러면 그 카드의 그림자까지 같이 잘린다
       * (실제로 한 번 겪었다 — 카드 15장의 그림자가 코드엔 있는데 화면엔 안 나왔다).
       * 반경을 값으로 받으면 그림자는 살고 틴트만 모서리 안에 머문다.
       */
      style={[StyleSheet.absoluteFill, r != null && { borderRadius: r, borderCurve: 'continuous' }]}
      pointerEvents="none"
    />
  );
}

/** tone에 맞는 테두리색 — 그라디언트만 깔면 카드 경계가 여전히 무채색이라 따로 논다 */
export function toneBorder(tone: BentoTone) {
  return tone === 'plain' ? undefined : { borderColor: `rgba(${TONE_RGB[tone]},0.22)` };
}

export function BentoCard({ children, tone = 'plain', half, onPress, style }: BentoCardProps) {
  const rgb = tone === 'plain' ? null : TONE_RGB[tone];

  const body = (
    <>
      <SoftTint tone={tone} />
      {children}
    </>
  );

  const cardStyle = [
    styles.card,
    half && styles.half,
    rgb && { borderColor: `rgba(${rgb},0.22)` },
    style,
  ];

  if (!onPress) return <View style={cardStyle}>{body}</View>;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [cardStyle, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

/** 반 칸짜리 카드 두 장을 나란히 놓는 줄 */
export function BentoRow({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    ...shadow.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
    padding: 20,
  },
  half: { flex: 1 },
  row: { flexDirection: 'row', gap: 12 },
  pressed: { opacity: 0.85 },
});
