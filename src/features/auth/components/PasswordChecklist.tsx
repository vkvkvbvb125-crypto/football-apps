// src/features/auth/components/PasswordChecklist.tsx
// 비밀번호 조건을 입력하는 동안 실시간으로 보여준다.
//
// 제출한 뒤에 "8자 이상이어야 해요"라고 알려주면 이미 늦다 — 무엇이 필요한지 미리 보이고,
// 채울 때마다 하나씩 초록으로 바뀌어야 어디까지 왔는지 알 수 있다.
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { radius, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';
import { passwordChecks } from '../password';

export function PasswordChecklist({ value }: { value: string }) {
  const { colors, styles } = useThemed(makeStyles);
  const checks = passwordChecks(value);
  const allOk = checks.every((c) => c.ok);

  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.head, allOk && { color: colors.green }]}>
        {allOk ? '비밀번호 조건을 모두 충족했어요' : '비밀번호 조건'}
      </Text>

      {checks.map((c) => (
        <View key={c.label} style={[styles.row, c.ok && styles.rowOk]}>
          <Ionicons
            name={c.ok ? 'checkmark' : 'ellipse-outline'}
            size={13}
            color={c.ok ? colors.green : colors.textDim}
          />
          <Text style={[styles.text, c.ok && styles.textOk]}>
            {c.label}
            {!!c.example && <Text style={styles.example}> 예: {c.example}</Text>}
          </Text>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  head: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.button,
    backgroundColor: colors.inputBg,
  },
  // 충족한 줄만 초록 배경 — 남은 것이 무엇인지 눈으로 셀 수 있다
  rowOk: { backgroundColor: colors.greenTint },
  text: { flex: 1, color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  textOk: { color: colors.green, fontWeight: '700' },
  example: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  });
