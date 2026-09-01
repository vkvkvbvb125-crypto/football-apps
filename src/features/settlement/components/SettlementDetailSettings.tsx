// src/features/settlement/components/SettlementDetailSettings.tsx
// 정산 상세의 「상세 설정」 — 납부 기한 · 메모 · 면제.
//
// Reference 「총무② 정산 생성」에는 이 셋이 없어서 생성 화면에서 걷어냈다. 대신 여기서 다룬다.
// DB 컬럼(due_date, memo, exempt)은 그대로이고 손대는 자리만 옮긴 것이다.
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../../components/nativeText';
import { radius, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';
import type { Settlement } from '../stores/settlementStore';

/** 납부 기한 프리셋 — 달력을 띄울 만큼 정밀할 필요가 없는 값이라 칩으로 고른다 */
const DUE_PRESETS: { days: number | null; label: string }[] = [
  { days: null, label: '없음' },
  { days: 7, label: '7일 뒤' },
  { days: 14, label: '14일 뒤' },
  { days: 30, label: '30일 뒤' },
];

/** 로컬 기준 yyyy-mm-dd — toISOString()을 쓰면 UTC로 밀려 하루 어긋난다 */
function toDateOnly(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dateFromDays(days: number | null) {
  if (days == null) return null;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateOnly(d);
}

interface Props {
  settlement: Settlement;
  nameFor: (teamMemberId: string | null) => string;
  onUpdate: (patch: { memo?: string | null; dueDate?: string | null }) => void;
  onExempt: (shareId: string) => void;
}

export function SettlementDetailSettings({ settlement, nameFor, onUpdate, onExempt }: Props) {
  const { colors, styles } = useThemed(makeStyles);
  const [open, setOpen] = useState(false);
  const [memo, setMemo] = useState(settlement.memo ?? '');

  // 이미 입금 확인된 사람은 제외 대상이 아니다 — 받은 돈을 없던 일로 만들 수 없다
  const exemptable = settlement.shares.filter((s) => !s.paid);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
      >
        <Text style={styles.toggleText}>상세 설정</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
      </Pressable>

      {open && (
        <View style={styles.body}>
          {/* 납부 기한 */}
          <View style={{ gap: 8 }}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>납부 기한</Text>
              {!!settlement.dueDate && (
                <Text style={styles.hint}>
                  {new Date(settlement.dueDate).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}까지
                </Text>
              )}
            </View>
            <View style={styles.chipRow}>
              {DUE_PRESETS.map((p) => {
                const target = dateFromDays(p.days);
                const on = (settlement.dueDate ?? null) === target;
                return (
                  <Pressable
                    key={p.label}
                    onPress={() => onUpdate({ dueDate: target })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    style={[styles.presetChip, on && styles.presetChipOn]}
                  >
                    <Text style={[styles.presetChipText, on && styles.presetChipTextOn]}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* 메모 */}
          <View style={{ gap: 8 }}>
            <Text style={styles.label}>메모</Text>
            <TextInput
              style={styles.memoInput}
              value={memo}
              onChangeText={setMemo}
              onBlur={() => onUpdate({ memo: memo.trim() || null })}
              placeholder="구장비 + 음료"
              placeholderTextColor={colors.placeholder}
              returnKeyType="done"
              onSubmitEditing={() => onUpdate({ memo: memo.trim() || null })}
            />
          </View>

          {/* 면제 */}
          <View style={{ gap: 8 }}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>정산 대상 {settlement.shares.length}명</Text>
              <Text style={styles.hint}>제외하면 1인당 금액이 다시 계산돼요</Text>
            </View>
            {exemptable.length === 0 ? (
              <Text style={styles.hint}>전원 입금이 확인돼 제외할 수 있는 사람이 없어요</Text>
            ) : (
              <View style={styles.chipWrap}>
                {exemptable.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => onExempt(s.id)}
                    style={({ pressed }) => [styles.memberChip, pressed && styles.pressed]}
                  >
                    <Text style={styles.memberChipText}>{s.guestName ?? nameFor(s.teamMemberId)}</Text>
                    <Ionicons name="close" size={13} color={colors.textMuted} />
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  wrap: { borderTopWidth: 1, borderTopColor: colors.divider },
  pressed: { opacity: 0.85 },

  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  toggleText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },

  body: { gap: 16, paddingBottom: 12 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  hint: { color: colors.textFaint, fontSize: 11, fontWeight: '600' },

  chipRow: { flexDirection: 'row', gap: 7 },
  presetChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radius.pill,
    alignItems: 'center',
    backgroundColor: colors.inputBg,
  },
  presetChipOn: { backgroundColor: colors.greenTint, borderColor: colors.greenDeep },
  presetChipText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  presetChipTextOn: { color: colors.green },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  memberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.neutralTint,
    borderWidth: 1,
    borderColor: colors.border,
  },
  memberChipText: { color: colors.textBody, fontSize: 12, fontWeight: '700' },

  memoInput: {
    height: 46,
    paddingHorizontal: 14,
    borderRadius: radius.button,
    backgroundColor: colors.inputBg,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  });
