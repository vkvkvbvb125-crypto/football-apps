// src/components/EmptyState.tsx — 리디자인 적용판
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from './nativeText';
import { colors } from '../theme';

interface Props {
  emoji?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ emoji, title, subtitle, actionLabel, onAction }: Props) {
  return (
    <View style={styles.wrap}>
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

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 56, paddingHorizontal: 32, gap: 10 },
  emojiBox: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emoji: { fontSize: 26 },
  title: { color: colors.text, fontSize: 15, fontWeight: '800', letterSpacing: -0.2, textAlign: 'center' },
  subtitle: { color: colors.textMuted, fontSize: 12.5, fontWeight: '500', lineHeight: 19, textAlign: 'center' },
  action: {
    marginTop: 8,
    height: 46,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { color: colors.bgRoot, fontSize: 13.5, fontWeight: '800' },
});
