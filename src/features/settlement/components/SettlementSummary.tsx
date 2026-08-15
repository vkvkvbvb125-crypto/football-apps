// src/features/settlement/components/SettlementSummary.tsx
// Reference 「팀원③ 정산 내역」의 요약 표와, 「총무⑥ / 팀원⑤ 정산 완료」 화면.
//
// 두 완료 화면은 문구와 항목만 다르고 생김새가 같다 — 한 컴포넌트에 넣고 내용을 받는다.
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { colors, radius } from '../../../theme';

/** 라벨 — 값 한 줄. 값은 자릿수가 흔들리지 않게 tabular */
export function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowValueStrong]}>{value}</Text>
    </View>
  );
}

export function SummaryBox({ children }: { children: React.ReactNode }) {
  return <View style={styles.box}>{children}</View>;
}

/**
 * 정산 완료 알림 패널.
 *
 * "제출"이라는 말을 쓰지 않는다 — 돈은 은행 앱에서 오갔고 킥데이는 그 사실을 기록만 한다.
 * 킥데이가 결제를 처리한 것처럼 읽히면 실제 동작과도, 전자금융거래법 경계와도 어긋난다.
 */
export function SettlementDonePanel({
  title,
  sub,
  rows,
  actionLabel,
  onAction,
}: {
  title: string;
  sub?: string;
  rows: { label: string; value: string }[];
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.donePanel}>
      <View style={styles.doneCircle}>
        <Ionicons name="checkmark" size={38} color={colors.green} />
      </View>
      <Text style={styles.doneTitle}>{title}</Text>
      {!!sub && <Text style={styles.doneSub}>{sub}</Text>}

      <SummaryBox>
        {rows.map((r) => (
          <SummaryRow key={r.label} label={r.label} value={r.value} />
        ))}
      </SummaryBox>

      {!!actionLabel && !!onAction && (
        <Pressable onPress={onAction} style={({ pressed }) => [styles.doneCta, pressed && { opacity: 0.85 }]}>
          <Text style={styles.doneCtaText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 14,
    paddingVertical: 4,
    alignSelf: 'stretch',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowLabel: { color: colors.textDim, fontSize: 12.5, fontWeight: '700' },
  rowValue: { color: colors.textStrong, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  rowValueStrong: { color: colors.green, fontSize: 15 },

  donePanel: { alignItems: 'center', gap: 12, paddingVertical: 8 },
  doneCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.greenTint,
    borderWidth: 2,
    borderColor: colors.green,
    marginBottom: 2,
  },
  doneTitle: { color: colors.green, fontSize: 15.5, fontWeight: '800', textAlign: 'center' },
  doneSub: { color: colors.textDim, fontSize: 12, fontWeight: '600', textAlign: 'center' },

  doneCta: {
    alignSelf: 'stretch',
    height: 50,
    borderRadius: radius.button,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  doneCtaText: { color: colors.bgRoot, fontSize: 14.5, fontWeight: '800' },
});
