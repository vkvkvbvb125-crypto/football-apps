// src/components/BentoCard.tsx — 벤토 격자용 카드
//
// 카드마다 아주 옅은 그라디언트를 깔 수 있다. 세기는 한 자리에서만 정한다 —
// 카드마다 알파를 따로 정하면 어떤 카드는 튀고 어떤 카드는 안 보인다.
//
// 색은 "이 카드가 무엇에 관한 것인가"를 따라간다(경기=초록, 돈=금, 글=파랑).
// 장식이 아니라 분류다.
import type { ReactNode } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius } from '../theme';

/**
 * 그라디언트 세기. 0.10을 넘기면 카드가 배경에서 뜨는 게 아니라 색칠한 것처럼 보인다.
 * 0.05 아래로 내리면 어두운 화면에서 아예 안 보인다.
 */
const TINT_TOP = 0.09;
const TINT_MID = 0.03;

export type BentoTone = 'plain' | 'green' | 'gold' | 'blue' | 'danger';

const TONE_RGB: Record<Exclude<BentoTone, 'plain'>, string> = {
  green: '74,222,128',
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
export function SoftTint({ tone }: { tone: BentoTone }) {
  if (tone === 'plain') return null;
  const rgb = TONE_RGB[tone];
  return (
    <LinearGradient
      colors={[`rgba(${rgb},${TINT_TOP})`, `rgba(${rgb},${TINT_MID})`, 'rgba(0,0,0,0)']}
      locations={[0, 0.45, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={StyleSheet.absoluteFill}
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
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    overflow: 'hidden',
  },
  half: { flex: 1 },
  row: { flexDirection: 'row', gap: 12 },
  pressed: { opacity: 0.85 },
});
