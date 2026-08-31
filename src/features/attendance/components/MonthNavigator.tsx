import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';

interface MonthNavigatorProps {
  offset: number;
  onChange: (offset: number) => void;
}

export function MonthNavigator({ offset, onChange }: MonthNavigatorProps) {
  const { colors, styles } = useThemed(makeStyles);
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() + offset);
  const label = `${date.getFullYear()}년 ${date.getMonth() + 1}월`;

  return (
    <View style={styles.row}>
      <Pressable onPress={() => onChange(offset - 1)} hitSlop={8}>
        <Ionicons name="chevron-back" size={20} color={colors.textMuted} />
      </Pressable>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={() => onChange(offset + 1)} hitSlop={8}>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingVertical: 12,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  });
