// src/features/settlement/components/SettlementSummary.tsx
// Reference 「팀원③ 정산 내역」의 요약 표와, 「총무⑥ / 팀원⑤ 정산 완료」 화면.
//
// 두 완료 화면은 문구와 항목만 다르고 생김새가 같다 — 한 컴포넌트에 넣고 내용을 받는다.
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { radius, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';

/** 라벨 — 값 한 줄. 값은 자릿수가 흔들리지 않게 tabular */
export function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const { colors, styles } = useThemed(makeStyles);
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowValueStrong]}>{value}</Text>
    </View>
  );
}

export function SummaryBox({ children }: { children: React.ReactNode }) {
  const { colors, styles } = useThemed(makeStyles);
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
  const { colors, styles } = useThemed(makeStyles);
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
        <Pressable accessibilityRole="button" onPress={onAction} style={({ pressed }) => [styles.doneCta, pressed && { opacity: 0.85 }]}>
          <Text style={styles.doneCtaText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  myDueBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: radius.control,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.greenDeep,
    backgroundColor: colors.greenTint,
  },
  myDueLabel: { color: colors.textBody, fontSize: 13, fontWeight: '700' },
  myDueValue: { color: colors.green, fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },

  breakBox: {
    borderRadius: radius.control,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardAlt,
    paddingHorizontal: 14,
  },
  breakHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 46 },
  breakHeadText: { color: colors.textBody, fontSize: 13, fontWeight: '700' },
  breakRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 38 },
  breakRowFirst: { borderTopWidth: 1, borderTopColor: colors.divider },
  breakName: { flex: 1, color: colors.textBody, fontSize: 13, fontWeight: '600', minWidth: 0 },
  breakNameMe: { color: colors.text, fontWeight: '800' },
  breakAmount: { color: colors.textStrong, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  breakState: { width: 32, textAlign: 'right', color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  breakStateOn: { color: colors.green },
  breakExempt: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },

  box: {
    borderRadius: radius.card,
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
  rowLabel: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
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
  doneTitle: { color: colors.green, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  doneSub: { color: colors.textDim, fontSize: 12, fontWeight: '600', textAlign: 'center' },

  doneCta: {
    alignSelf: 'stretch',
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  doneCtaText: { color: colors.bgRoot, fontSize: 14, fontWeight: '800' },
  });

/**
 * 「내 정산 금액」 — 위 요약 줄들의 결론.
 *
 * 요약 박스가 총액·1인당·인원·이름을 나열하고 나면, 정작 "그래서 내가 얼마"가
 * 그 넷과 같은 무게로 섞여 버린다. 한 줄만 떼어 초록 테두리로 감싼다 —
 * 화면에서 초록은 「지금 중요한 것」에만 쓴다는 규칙 그대로다.
 */
export function MyDueRow({ amount, paid }: { amount: number; paid?: boolean }) {
  const { colors, styles } = useThemed(makeStyles);
  return (
    <View style={styles.myDueBox}>
      <Text style={styles.myDueLabel}>{paid ? '입금 완료' : '내 정산 금액'}</Text>
      <Text selectable style={styles.myDueValue}>
        {amount.toLocaleString()}원
      </Text>
    </View>
  );
}

/**
 * 「상세 내역 보기」 — 누가 얼마를 내고 누가 냈는지.
 *
 * 접어 둔다. 정산을 여는 사람 대부분은 자기 금액만 확인하고 닫는데, 12명짜리 목록이
 * 늘 펼쳐져 있으면 그 한 줄을 찾으러 스크롤해야 한다. 필요할 때만 편다.
 */
export function DetailBreakdown({ rows }: { rows: { id: string; name: string; amount: number; paid: boolean; exempt: boolean; isMe?: boolean }[] }) {
  const { colors, styles } = useThemed(makeStyles);
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.breakBox}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={open ? '상세 내역 접기' : '상세 내역 보기'}
        style={({ pressed }) => [styles.breakHead, pressed && { opacity: 0.8 }]}
      >
        <Text style={styles.breakHeadText}>상세 내역 보기</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
      </Pressable>

      {open &&
        rows.map((r, i) => (
          <View key={r.id} style={[styles.breakRow, i === 0 && styles.breakRowFirst]}>
            <Text style={[styles.breakName, r.isMe && styles.breakNameMe]} numberOfLines={1}>
              {r.name}
              {r.isMe ? ' (나)' : ''}
            </Text>
            {r.exempt ? (
              <Text style={styles.breakExempt}>면제</Text>
            ) : (
              <>
                <Text style={styles.breakAmount}>{r.amount.toLocaleString()}원</Text>
                <Text style={[styles.breakState, r.paid && styles.breakStateOn]}>{r.paid ? '완료' : '미납'}</Text>
              </>
            )}
          </View>
        ))}
    </View>
  );
}
