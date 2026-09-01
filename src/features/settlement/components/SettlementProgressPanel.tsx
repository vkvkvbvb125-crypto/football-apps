// src/features/settlement/components/SettlementProgressPanel.tsx
// Reference 「총무⑤ 정산 진행 현황」.
//
// 이전에는 가는 막대 하나에 명단을 통째로 붙여 놨는데, 총무가 이 화면에서 답을 얻어야 하는
// 질문은 "누가 아직 안 냈나" 하나다. 그래서 완료와 미완료를 갈라 놓고, 미완료를 먼저 세운다.
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { radius, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';
import { ProgressRing } from './SettlementCard';
import type { ShareRow } from '../stores/settlementStore';

interface Props {
  shares: ShareRow[];
  totalAmount: number;
  perPerson: number;
  nameFor: (share: ShareRow) => string;
  /** 총무만 — 미완료 행을 눌러 입금 확인 대상으로 고른다 */
  isAdmin: boolean;
  selectedIds: Record<string, boolean>;
  onToggleSelect: (shareId: string) => void;
  onRefresh: () => void;
  refreshing?: boolean;
}

export function SettlementProgressPanel({
  shares,
  totalAmount,
  perPerson,
  nameFor,
  isAdmin,
  selectedIds,
  onToggleSelect,
  onRefresh,
  refreshing,
}: Props) {
  const { colors, styles } = useThemed(makeStyles);
  const done = shares.filter((s) => s.paid);
  const waiting = shares.filter((s) => !s.paid);
  const pct = shares.length ? done.length / shares.length : 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.amountRow}>
        <Text style={styles.amountTotal}>{totalAmount.toLocaleString()}원</Text>
        <Text style={styles.amountPer}>(1인당 {perPerson.toLocaleString()}원)</Text>
      </View>

      <View style={styles.ringWrap}>
        <ProgressRing pct={pct} size={104} />
        <Text style={styles.ringCount}>
          {done.length} / {shares.length} 완료
        </Text>
      </View>

      {/* 아직 안 낸 사람이 먼저다 — 다 낸 사람 목록은 확인용이지 할 일이 아니다 */}
      {waiting.length > 0 && (
        <Group title={`미완료 (${waiting.length})`}>
          {waiting.map((s) => (
            <Row
              key={s.id}
              name={nameFor(s)}
              isMe={s.isMe}
              // 팀원이 "보냈다"고 신고한 상태 — 총무 확인만 남았다
              status={s.markedPaid ? '확인 대기' : '대기'}
              tone={s.markedPaid ? 'gold' : 'muted'}
              selected={!!selectedIds[s.id]}
              onPress={isAdmin ? () => onToggleSelect(s.id) : undefined}
            />
          ))}
        </Group>
      )}

      {done.length > 0 && (
        <Group title={`정산 완료 (${done.length})`}>
          {done.map((s) => (
            <Row key={s.id} name={nameFor(s)} isMe={s.isMe} status="완료" tone="green" />
          ))}
        </Group>
      )}

      <Pressable
        accessibilityRole="button"
        onPress={onRefresh}
        disabled={refreshing}
        style={({ pressed }) => [styles.refresh, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="refresh" size={15} color={colors.textStrong} />
        <Text style={styles.refreshText}>{refreshing ? '불러오는 중…' : '현황 새로고침'}</Text>
      </Pressable>
    </View>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors, styles } = useThemed(makeStyles);
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

/* 테마마다 값이 다르므로 표를 함수로 바꿨다 — 모듈 최상단에서 만들면 굳는다 */
const toneOf = (colors: Palette) =>
  ({
    green: { bg: colors.greenTint, fg: colors.green },
    gold: { bg: colors.goldTint, fg: colors.gold },
    muted: { bg: colors.neutralTint, fg: colors.textMuted },
  }) as const;

function Row({
  name,
  isMe,
  status,
  tone,
  selected,
  onPress,
}: {
  name: string;
  isMe?: boolean;
  status: string;
  tone: keyof ReturnType<typeof toneOf>;
  selected?: boolean;
  onPress?: () => void;
}) {
  const { colors, styles } = useThemed(makeStyles);
  const t = toneOf(colors)[tone];
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!selected }}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && !!onPress && { opacity: 0.85 }]}
    >
      <Text style={styles.rowName} numberOfLines={1}>
        {isMe ? `${name} (나)` : name}
      </Text>
      {selected && <Ionicons name="checkmark" size={14} color={colors.green} />}
      <View style={[styles.badge, { backgroundColor: t.bg }]}>
        <Text style={[styles.badgeText, { color: t.fg }]}>{status}</Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  wrap: { gap: 14 },

  amountRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 7 },
  amountTotal: { color: colors.text, fontSize: 21, fontWeight: '800', letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  amountPer: { color: colors.textDim, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },

  ringWrap: { alignItems: 'center', gap: 8 },
  ringCount: { color: colors.textBody, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },

  groupTitle: { color: colors.textDim, fontSize: 11, fontWeight: '800' },
  group: {
    borderRadius: radius.card,
    backgroundColor: colors.inputBg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowSelected: { backgroundColor: 'rgba(34,197,94,0.07)' },
  rowName: { flex: 1, color: colors.textStrong, fontSize: 13, fontWeight: '700' },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: '800' },

  refresh: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 46,
    borderRadius: radius.pill,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  refreshText: { color: colors.textStrong, fontSize: 13, fontWeight: '800' },
  });
