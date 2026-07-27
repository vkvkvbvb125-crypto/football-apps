// src/features/settlement/components/CreateSettlementSheet.tsx
// "아직 정산 등록 안 한" 경기 → 총무가 정산을 만드는 시트
// 총액을 넣으면 1인당 금액이 자동 계산되고, 참석자만 대상으로 요청이 발송된다.
// 1인당 금액은 settlementStore.splitAmount()와 반드시 같은 계산이어야 미리보기와 실제
// 저장값이 어긋나지 않는다 (10원 단위 올림 + surplus는 실제로 그렇게 저장되는 값).
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../../components/nativeText';
import { colors } from '../../../theme';
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
  onSubmit: (p: { total: number; targetIds: string[]; memo: string }) => void;
}

const QUICK = [60000, 80000, 100000, 120000];

export function CreateSettlementSheet({
  visible,
  onClose,
  matchLabel,
  attendees,
  suggestedTotal,
  account,
  onSubmit,
}: Props) {
  const [totalText, setTotalText] = useState(String(suggestedTotal ?? ''));
  const [exempt, setExempt] = useState<Record<string, boolean>>({});
  const [memo, setMemo] = useState('');

  const targets = useMemo(() => attendees.filter((a) => !exempt[a.id]), [attendees, exempt]);
  const total = Number(totalText.replace(/[^0-9]/g, '')) || 0;
  const { perPerson, surplus } = splitAmount(total, targets.length);
  const valid = total > 0 && targets.length > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.head}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.title}>정산 만들기</Text>
              <Text style={styles.subtitle}>{matchLabel}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.close}>닫기</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ gap: 14 }} showsVerticalScrollIndicator={false}>
            <View style={{ gap: 8 }}>
              <Text style={styles.label}>총 비용</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={totalText}
                  onChangeText={setTotalText}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.placeholder}
                />
                <Text style={styles.inputUnit}>원</Text>
              </View>
              <View style={styles.quickRow}>
                {QUICK.map((q) => (
                  <Pressable key={q} onPress={() => setTotalText(String(q))} style={styles.quick}>
                    <Text style={styles.quickText}>{(q / 10000).toFixed(0)}만</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.calcCard}>
              <View style={styles.calcRow}>
                <Text style={styles.calcLabel}>분배 대상</Text>
                <Text style={styles.calcValue}>{targets.length}명</Text>
              </View>
              <View style={styles.calcDivider} />
              <View style={styles.calcRow}>
                <Text style={styles.calcLabel}>1인당</Text>
                <Text style={styles.calcBig}>{perPerson.toLocaleString()}원</Text>
              </View>
              {surplus !== 0 && total > 0 && (
                <Text style={styles.calcNote}>10원 단위로 올림해서 {surplus.toLocaleString()}원 남아요 · 회비로 적립돼요</Text>
              )}
            </View>

            <View style={{ gap: 8 }}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>참석자 {attendees.length}명</Text>
                <Text style={styles.labelHint}>탭하면 면제 처리</Text>
              </View>
              <View style={styles.chipWrap}>
                {attendees.map((a) => {
                  const off = !!exempt[a.id];
                  return (
                    <Pressable
                      key={a.id}
                      onPress={() => setExempt((p) => ({ ...p, [a.id]: !p[a.id] }))}
                      style={[styles.chip, off && styles.chipOff]}
                    >
                      <Text style={[styles.chipText, off && styles.chipTextOff]}>{a.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={styles.label}>메모 (선택)</Text>
              <TextInput
                style={[styles.input, { height: 46, fontSize: 14, fontWeight: '600' }]}
                value={memo}
                onChangeText={setMemo}
                placeholder="구장비 + 음료"
                placeholderTextColor={colors.placeholder}
              />
            </View>

            <View style={styles.accountBox}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.accountLabel}>입금받을 계좌</Text>
                <Text style={styles.accountNo}>
                  {account.bank} {account.no}
                </Text>
                <Text style={styles.accountHolder}>예금주 {account.holder}</Text>
              </View>
              <Pressable onPress={onClose} hitSlop={8}>
                <Text style={styles.accountEdit}>변경</Text>
              </Pressable>
            </View>
          </ScrollView>

          <Pressable
            disabled={!valid}
            onPress={() => {
              onSubmit({ total, targetIds: targets.map((t) => t.id), memo: memo.trim() });
              onClose();
            }}
            style={[styles.cta, !valid && { opacity: 0.4 }]}
          >
            <Text style={styles.ctaText}>
              {valid ? `${targets.length}명에게 정산 요청 보내기` : '총 비용을 입력해주세요'}
            </Text>
          </Pressable>
          <Text style={styles.note}>참석자에게 알림이 가고, 각자 송금 화면에서 바로 보낼 수 있어요</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)' },
  sheet: {
    maxHeight: '90%',
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 26,
    gap: 14,
  },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: '#2C3833', marginBottom: 4 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { color: colors.textDim, fontSize: 11.5, fontWeight: '600' },
  close: { color: colors.textDim, fontSize: 13, fontWeight: '700' },

  label: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  labelHint: { color: '#5F6B66', fontSize: 10.5, fontWeight: '600' },

  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    height: 54,
    paddingHorizontal: 14,
    borderRadius: 13,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  inputUnit: { color: colors.textMuted, fontSize: 15, fontWeight: '700' },
  quickRow: { flexDirection: 'row', gap: 7 },
  quick: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickText: { color: colors.textMuted, fontSize: 11.5, fontWeight: '800' },

  calcCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(74,222,128,0.06)',
    borderWidth: 1,
    borderColor: '#2F4A3A',
    gap: 10,
  },
  calcRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  calcLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  calcValue: { color: colors.textStrong, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  calcBig: {
    color: colors.green,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.8,
    fontVariant: ['tabular-nums'],
  },
  calcDivider: { height: 1, backgroundColor: 'rgba(74,222,128,0.14)' },
  calcNote: { color: colors.gold, fontSize: 10.5, fontWeight: '600', lineHeight: 15 },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(74,222,128,0.09)',
    borderWidth: 1,
    borderColor: '#2F4A3A',
  },
  chipOff: { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: colors.border },
  chipText: { color: colors.green, fontSize: 12, fontWeight: '700' },
  chipTextOff: { color: '#5F6B66', textDecorationLine: 'line-through' },

  accountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  accountLabel: { color: colors.textDim, fontSize: 10.5, fontWeight: '700' },
  accountNo: { color: colors.textStrong, fontSize: 12.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
  accountHolder: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  accountEdit: { color: colors.green, fontSize: 11.5, fontWeight: '800' },

  cta: { height: 52, borderRadius: 16, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: colors.bgRoot, fontSize: 15, fontWeight: '800' },
  note: { color: '#5F6B66', fontSize: 11, fontWeight: '600', textAlign: 'center' },
});
