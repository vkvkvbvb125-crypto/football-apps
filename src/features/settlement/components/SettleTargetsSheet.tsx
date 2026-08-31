// src/features/settlement/components/SettleTargetsSheet.tsx
// 「참석자 N명 ›」 — 정산을 만들기 전에 누가 나눠 내게 되는지 미리 본다.
//
// 미등록 카드에서 총무가 정산 만들기를 누르면 금액부터 물어보는데, 정작 그 금액이
// 몇 명에게 나뉘는지는 인원 숫자 하나로만 알 수 있었다. 이름을 못 보니 "지난주에
// 안 온 사람이 들어가 있진 않나"를 확인하려면 일정 탭까지 다녀와야 했다.
//
// 여기서 면제·제외를 하지는 않는다 — 그건 정산 생성 시트가 이미 맡고 있다.
// 이 화면은 읽기 전용 미리보기다.
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../../components/nativeText';
import { font, radius, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';
import type { Attendee } from './CreateSettlementSheet';

function initialOf(name: string) {
  return name.trim().slice(0, 2) || '?';
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** "8월 18일 경기 · 20:00 · 성내천풋살장" */
  matchLabel: string;
  targets: Attendee[];
  /** 투표한 사람이 없어 팀 전체가 들어간 경우 — 그대로 만들면 안 온 사람도 포함된다 */
  fromAllMembers: boolean;
  /** 여기서 바로 정산 생성으로 넘어간다. 총무가 아니면 없다 */
  onCreate?: () => void;
}

export function SettleTargetsSheet({ visible, onClose, matchLabel, targets, fromAllMembers, onCreate }: Props) {
  const { colors, styles } = useThemed(makeStyles);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.overlayTap} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Pressable onPress={onClose} hitSlop={10} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={22} color={colors.textStrong} />
            </Pressable>
            <Text style={styles.title}>정산 대상</Text>
            <View style={styles.backBtn} />
          </View>
          <Text style={styles.subtitle}>{matchLabel}</Text>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {/*
              1인당 금액은 여기서 못 보여준다 — 총액이 아직 없다.
              대신 "무엇을 기준으로 나뉘는지"를 적는다. 숫자는 다음 화면이 맡는다.
            */}
            <View style={styles.card}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>나눠 낼 인원</Text>
                <Text style={styles.summaryValue}>{targets.length}명</Text>
              </View>
              <View style={styles.divider} />
              <Text style={styles.note}>
                {fromAllMembers
                  ? '참석 투표한 사람이 없어 팀원 전체가 들어갔어요. 안 온 사람은 다음 화면에서 뺄 수 있어요.'
                  : '참석으로 투표한 사람들이에요. 총액을 넣으면 1인당 금액이 계산돼요.'}
              </Text>
            </View>

            {targets.length === 0 ? (
              <Text style={styles.empty}>나눠 낼 사람이 없어요</Text>
            ) : (
              <View style={styles.card}>
                {targets.map((t, i) => (
                  <View key={t.id} style={[styles.row, i > 0 && styles.rowLine]}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{initialOf(t.name)}</Text>
                    </View>
                    <Text style={styles.name} numberOfLines={1}>
                      {t.name}
                    </Text>
                    <Text style={styles.share}>1/{targets.length}</Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {!!onCreate && (
            <Pressable onPress={onCreate} style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}>
              <Text style={styles.ctaText}>이 명단으로 정산 만들기</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  overlayTap: { flex: 1 },
  sheet: {
    maxHeight: '86%',
    backgroundColor: colors.bgScreen,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: { ...font.title, color: colors.text },
  subtitle: { color: colors.textMuted, fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: -8 },
  body: { gap: 12, paddingBottom: 8 },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  summaryValue: { color: colors.text, fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  divider: { height: 1, backgroundColor: colors.divider, marginHorizontal: -16 },
  note: { color: colors.textMuted, fontSize: 12, fontWeight: '500', lineHeight: 17 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  /** 카드 padding(16)을 뚫어 구분선이 칸 폭 전체를 지나가게 */
  rowLine: { borderTopWidth: 1, borderTopColor: colors.divider, marginHorizontal: -16, paddingHorizontal: 16 },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarText: { color: colors.textBody, fontSize: 11, fontWeight: '800' },
  name: { flex: 1, color: colors.textStrong, fontSize: 14, fontWeight: '700', minWidth: 0 },
  share: { color: colors.textMuted, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },

  empty: { color: colors.textMuted, fontSize: 13, fontWeight: '600', textAlign: 'center', paddingVertical: 24 },

  cta: {
    height: 50,
    borderRadius: radius.button,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.greenDeep,
    backgroundColor: colors.greenTint,
  },
  ctaText: { color: colors.green, fontSize: 14, fontWeight: '800' },
  });
