// src/features/settlement/components/PendingSettlementCard.tsx
// "아직 정산 등록 안 한 경기" 카드 — 정산 탭 최상단에 뜬다.
// 총무: 정산 만들기 CTA / 멤버: 총무 대기 안내
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { colors, radius } from '../../../theme';

interface Props {
  matchLabel: string; // "7월 26일 (일) · 풋살장 A구장"
  attendeeCount: number;
  /** 경기 종료 후 지난 일수 — 3일 넘으면 경고 톤 */
  daysSince: number;
  isAdmin: boolean;
  suggestedTotal?: number;
  onCreate: () => void;
  /** 정산 없이 종료 처리 — settlements.status='skipped' 행을 만들어 목록에서 뺀다 */
  onSkip?: () => void;
}

export function PendingSettlementCard({
  matchLabel,
  attendeeCount,
  daysSince,
  isAdmin,
  suggestedTotal,
  onCreate,
  onSkip,
}: Props) {
  const overdue = daysSince >= 3;

  return (
    <View style={[styles.card, overdue && styles.cardOverdue]}>
      <View style={styles.head}>
        <View style={[styles.badge, overdue ? styles.badgeOverdue : styles.badgeNormal]}>
          <Text style={[styles.badgeText, overdue && { color: colors.gold }]}>
            {overdue ? `${daysSince}일 지남` : '정산 미등록'}
          </Text>
        </View>
        <Text style={styles.headSub}>경기 종료</Text>
      </View>

      <View style={{ gap: 5 }}>
        <Text style={styles.title}>{matchLabel}</Text>
        <Text style={styles.sub}>
          참석 {attendeeCount}명
          {suggestedTotal != null ? ` · 구장비 ${suggestedTotal.toLocaleString()}원 (저장된 값)` : ''}
        </Text>
      </View>

      {isAdmin ? (
        <>
          <View style={styles.hintBox}>
            <Ionicons name="information-circle-outline" size={15} color={colors.textMuted} />
            <Text style={styles.hintText}>총 비용만 입력하면 참석자 수로 1인당 금액을 자동 계산해요</Text>
          </View>
          <View style={styles.ctaRow}>
            {!!onSkip && (
              <Pressable onPress={onSkip} style={styles.ghost}>
                <Text style={styles.ghostText}>정산 없이 종료</Text>
              </Pressable>
            )}
            <Pressable onPress={onCreate} style={styles.cta}>
              <Ionicons name="calculator-outline" size={17} color={colors.bgRoot} />
              <Text style={styles.ctaText}>정산 만들기</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <View style={styles.waitBox}>
          <Text style={styles.waitText}>총무가 정산을 등록하면 알림으로 알려드려요</Text>
        </View>
      )}
    </View>
  );
}

/** 정산 이력이 아예 없는 팀의 빈 상태 */
export function SettlementEmpty({ isAdmin }: { isAdmin: boolean }) {
  return (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIcon}>
        <Ionicons name="wallet-outline" size={26} color={colors.textDim} />
      </View>
      <Text style={styles.emptyTitle}>아직 정산할 경기가 없어요</Text>
      <Text style={styles.emptySub}>
        {isAdmin ? '경기가 끝나면 이 화면에서 회비를 정산할 수 있어요' : '총무가 정산을 등록하면 여기에 표시돼요'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    gap: 14,
  },
  cardOverdue: { borderColor: 'rgba(210,163,76,0.35)', backgroundColor: 'rgba(210,163,76,0.05)' },

  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  badgeNormal: { backgroundColor: 'rgba(255,255,255,0.06)' },
  badgeOverdue: { backgroundColor: 'rgba(210,163,76,0.16)' },
  badgeText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  headSub: { color: colors.textDim, fontSize: 11.5, fontWeight: '600' },

  title: { color: colors.text, fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  sub: { color: colors.textMuted, fontSize: 12.5, fontWeight: '600' },

  hintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  hintText: { flex: 1, color: colors.textMuted, fontSize: 11.5, fontWeight: '600', lineHeight: 17 },

  ctaRow: { flexDirection: 'row', gap: 8 },
  ghost: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: '#26332D',
  },
  ghostText: { color: colors.textMuted, fontSize: 13, fontWeight: '800' },
  cta: {
    flex: 1.4,
    height: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.green,
  },
  ctaText: { color: colors.bgRoot, fontSize: 14, fontWeight: '800' },

  waitBox: {
    padding: 13,
    borderRadius: 12,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  waitText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },

  emptyWrap: { alignItems: 'center', gap: 10, paddingVertical: 56 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 4,
  },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  emptySub: { color: colors.textDim, fontSize: 12.5, fontWeight: '600', textAlign: 'center', lineHeight: 19 },
});
