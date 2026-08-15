// src/features/settlement/components/CreateSettlementSheet.tsx
// Reference 「총무② 정산 생성」 구현.
//
// 화면에 두는 것은 Reference와 동일하게 넷뿐이다:
//   총 정산 금액(입력) → 1인당 금액(자동 계산) → 참여 인원 → 입금 계좌 → "정산 링크 생성"
//
// 납부 기한·메모·면제는 여기 없다. 정산 상세의 「상세 설정」에서 다룬다.
// DB 컬럼(due_date, memo, exempt)은 그대로 살아 있고, 생성 시엔 기본값으로 만든다.
//
// 1인당 금액은 settlementStore.splitAmount()와 반드시 같은 계산이어야 미리보기와 실제
// 저장값이 어긋나지 않는다 (10원 단위 올림 + surplus는 실제로 그렇게 저장되는 값).
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../../components/nativeText';
import { colors, font, radius } from '../../../theme';
import { splitAmount } from '../stores/settlementStore';

export interface Attendee {
  id: string;
  name: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  matchLabel: string; // "7월 26일 (일) 20:00 · 풋살장 A구장"
  attendees: Attendee[];
  suggestedTotal?: number;
  account: { bank: string; no: string; holder: string };
  onSubmit: (p: { total: number; targetIds: string[]; memo: string; dueDate: string | null }) => void;
  /**
   * 회비를 걷지 않고 이 경기를 끝낸다. Reference 카드에는 자리가 없어 여기 둔다 —
   * 이 경로가 없으면 지난 경기가 "정산 미등록"으로 목록에 영원히 쌓인다.
   */
  onSkip?: () => void;
}

export function CreateSettlementSheet({
  visible,
  onClose,
  matchLabel,
  attendees,
  suggestedTotal,
  account,
  onSubmit,
  onSkip,
}: Props) {
  const [totalText, setTotalText] = useState(String(suggestedTotal ?? ''));

  const total = Number(totalText.replace(/[^0-9]/g, '')) || 0;
  const { perPerson, surplus } = splitAmount(total, attendees.length);
  const valid = total > 0 && attendees.length > 0;

  // Reference는 "120,000원"처럼 천 단위가 끊긴 상태로 보여준다 — 입력 중에도 같게 맞춘다
  const totalDisplay = total > 0 ? total.toLocaleString() : '';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.overlayTap} onPress={onClose} />
        <View style={styles.sheet}>
          {/* Reference 헤더 — 뒤로가기 + 가운데 제목 */}
          <View style={styles.head}>
            <Pressable onPress={onClose} hitSlop={10} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.textStrong} />
            </Pressable>
            <Text style={styles.title}>정산 생성</Text>
            <View style={styles.backBtn} />
          </View>
          <Text style={styles.subtitle}>{matchLabel}</Text>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {/* 금액 카드 — 총 정산 금액 / 1인당 금액 / 참여 인원 */}
            <View style={styles.card}>
              <Text style={styles.cardLabel}>총 정산 금액</Text>
              <View style={styles.amountRow}>
                <TextInput
                  style={styles.amountInput}
                  value={totalDisplay}
                  onChangeText={(t) => setTotalText(t.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.placeholder}
                />
                <Text style={styles.amountUnit}>원</Text>
              </View>

              <View style={styles.cardDivider} />

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>1인당 금액</Text>
                <Text style={styles.statValue}>{perPerson.toLocaleString()}원</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>참여 인원</Text>
                <Text style={styles.statValue}>{attendees.length}명</Text>
              </View>

              {surplus !== 0 && total > 0 && (
                <Text style={styles.surplusNote}>
                  10원 단위로 올림해서 {surplus.toLocaleString()}원 남아요 · 회비로 적립돼요
                </Text>
              )}
            </View>

            {/* 입금 계좌 */}
            <View style={styles.card}>
              <Text style={styles.cardLabel}>입금 계좌</Text>
              <View style={styles.accountRow}>
                <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
                  <Text style={styles.accountBank}>{account.bank || '계좌 미등록'}</Text>
                  <Text style={styles.accountNo} numberOfLines={1}>
                    {account.no}
                    {account.holder ? ` (${account.holder})` : ''}
                  </Text>
                </View>
                <Pressable onPress={onClose} hitSlop={8} style={styles.accountEditRow}>
                  <Text style={styles.accountEdit}>변경</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.green} />
                </Pressable>
              </View>
            </View>
          </ScrollView>

          <Pressable
            disabled={!valid}
            onPress={() => {
              // 납부 기한·메모는 생성 시 비워두고 정산 상세의 「상세 설정」에서 정한다.
              // 면제도 마찬가지 — 여기서는 참석자 전원을 대상으로 만든다.
              onSubmit({ total, targetIds: attendees.map((a) => a.id), memo: '', dueDate: null });
              onClose();
            }}
            style={({ pressed }) => [styles.cta, !valid && styles.ctaOff, pressed && valid && styles.pressed]}
          >
            <Text style={styles.ctaText}>{valid ? '정산 링크 생성' : '총 비용을 입력해주세요'}</Text>
          </Pressable>
          <Text style={styles.note}>참석자에게 알림이 가고, 각자 송금 화면에서 바로 보낼 수 있어요</Text>

          {!!onSkip && (
            <Pressable onPress={onSkip} hitSlop={8} style={({ pressed }) => [styles.skip, pressed && styles.pressed]}>
              <Text style={styles.skipText}>이 경기는 정산 없이 종료</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  overlayTap: { flex: 1 },
  sheet: {
    maxHeight: '92%',
    backgroundColor: colors.bgScreen,
    borderTopWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 12,
    paddingBottom: 26,
  },
  pressed: { opacity: 0.85 },

  // ── 헤더 ──────────────────────────────────────────────
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { color: colors.textDim, fontSize: 12, fontWeight: '600', textAlign: 'center', marginTop: 2 },

  body: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 16, gap: 12 },

  // ── 카드 (design.md: card 배경 + 1px border + radius.card) ──
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
  },
  cardLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },

  amountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  amountInput: {
    flex: 1,
    color: colors.text,
    ...font.amount,
    fontVariant: ['tabular-nums'],
    padding: 0,
  },
  amountUnit: { color: colors.textStrong, fontSize: 18, fontWeight: '700' },

  cardDivider: { height: 1, backgroundColor: colors.divider, marginHorizontal: -16 },

  statRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '500' },
  statValue: { color: colors.text, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  surplusNote: { color: colors.gold, fontSize: 11, fontWeight: '600', lineHeight: 16 },

  // ── 입금 계좌 ─────────────────────────────────────────
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  accountBank: { color: colors.text, fontSize: 14, fontWeight: '700' },
  accountNo: { color: colors.textMuted, fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'] },
  accountEditRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  accountEdit: { color: colors.green, fontSize: 12.5, fontWeight: '800' },

  // ── CTA ───────────────────────────────────────────────
  cta: {
    height: 52,
    marginHorizontal: 20,
    borderRadius: radius.button,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaOff: { opacity: 0.4 },
  ctaText: { color: colors.bgRoot, fontSize: 15, fontWeight: '800' },
  note: { color: colors.textFaint, fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 10 },
  skip: { alignSelf: 'center', paddingVertical: 10, marginTop: 2 },
  skipText: { color: colors.textDim, fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
});
