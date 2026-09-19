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
  /**
   * 총무가 **입력한** 경기 비용. 큰 금액 자리에는 쓰지 않는다 — 아래 sharesTotal 참고.
   * 둘이 갈리면 그 차이를 적어야 하므로 값 자체는 받는다.
   */
  totalAmount: number;
  /** 면제를 뺀 몫의 합 — **실제로 걷는 금액**. 이것이 큰 금액 자리에 온다 */
  sharesTotal: number;
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
  sharesTotal,
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
      {/*
        ⚠ **큰 금액은 `totalAmount`가 아니라 `sharesTotal`이다.**
          전에는 `totalAmount`를 찍었는데, 그 아래 「1인당 M원」·옆의 「N명」과
          **출처가 달라서 서로 안 맞을 수 있었다.** 2026-09-19에 기기에서 봤다:
          「참석 1명 · 1인당 10,000원」 아래에 「20,000원」. 1 × 10,000 ≠ 20,000인데
          세 숫자가 각자 다른 데서 와서 아무도 모순을 안 봤다.
          몫의 합을 쓰면 「N명 × 1인당 M원 = 이 금액」이 늘 성립한다.
      */}
      <View style={styles.amountRow}>
        <Text style={styles.amountTotal}>{sharesTotal.toLocaleString()}원</Text>
        <Text style={styles.amountPer}>(1인당 {perPerson.toLocaleString()}원)</Text>
      </View>

      {/*
        ⚠ **갈리면 숨기지 않고 적는다.** 총무가 적은 경기 비용과 실제로 걷는 금액이
          다르면 그만큼 **돈이 빈다.** 사람이 빠졌거나 면제가 붙은 것이라 총무가
          알아야 판단할 수 있다. 조용히 맞는 것처럼 보이는 쪽이 더 나쁘다.
      */}
      {sharesTotal !== totalAmount && (
        <Text style={styles.amountGap}>
          총무가 적은 경기 비용은 {totalAmount.toLocaleString()}원이에요 (
          {sharesTotal > totalAmount ? '+' : '−'}
          {Math.abs(totalAmount - sharesTotal).toLocaleString()}원 차이)
        </Text>
      )}

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
  /* 경고가 아니라 사실 고지다 — 빨강 대신 흐린 글씨로, 다만 읽히게 */
  amountGap: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },

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
