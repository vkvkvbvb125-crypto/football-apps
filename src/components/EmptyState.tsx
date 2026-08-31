// src/components/EmptyState.tsx — 리디자인 적용판
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './nativeText';
import { type Palette } from '../theme';
import { useThemed } from '../lib/useThemed';

interface Props {
  emoji?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** 섹션 안에 끼워 넣을 때 — 화면 전체용 여백(56)은 목록 자리에 쓰면 첫 화면 밖으로 밀린다 */
  compact?: boolean;
}

export function EmptyState({ emoji, title, subtitle, actionLabel, onAction, compact }: Props) {
  const { colors, styles } = useThemed(makeStyles);
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {!!emoji && (
        <View style={styles.emojiBox}>
          <Text style={styles.emoji}>{emoji}</Text>
        </View>
      )}
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {!!actionLabel && onAction && (
        <Pressable onPress={onAction} style={({ pressed }) => [styles.action, pressed && { opacity: 0.85 }]}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 56, paddingHorizontal: 32, gap: 10 },
  wrapCompact: { paddingVertical: 28 },
  emojiBox: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: colors.overlaySoft,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emoji: { fontSize: 26 },
  title: { color: colors.text, fontSize: 15, fontWeight: '800', letterSpacing: -0.2, textAlign: 'center' },
  subtitle: { color: colors.textMuted, fontSize: 12, fontWeight: '500', lineHeight: 19, textAlign: 'center' },
  action: {
    marginTop: 8,
    height: 46,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { color: colors.bgRoot, fontSize: 13, fontWeight: '800' },
  });
