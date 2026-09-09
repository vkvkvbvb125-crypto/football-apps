// src/features/settlement/components/SettlementEmpty.tsx
// 정산 이력이 아예 없는 팀의 빈 상태.
//
// "정산 미등록" 경기 카드는 별도 컴포넌트가 아니라 SettlementCard의 pending variant다
// (Reference 규칙: 하나의 컴포넌트에 variant만 둔다).
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { radius, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';

/*
  ⚠ 총무에게는 「할 일」이 하나 붙는다. 무엇·왜만 있고 어디로 가야 하는지가 없었다 —
    일정 탭의 빈 상태가 본보기다(무엇 · 왜 · 버튼, 게다가 역할별로 갈린다).

  문구가 약속하는 경로가 실제로 있는지 확인하고 적었다:
    경기운영 > 「경기 종료 → 정산으로」
      → AssignmentScreen.handleFinishMatch
      → updateMatchStatus(id, 'completed')
      → navigate('Settlement', { createForMatchId: id })
    정산 화면이 그 파라미터를 받아 생성 시트를 연다.
  즉 「경기가 끝나면 여기서 나눕니다」는 빈말이 아니다.

  ⚠ 팀원에게는 버튼을 주지 않는다. 정산을 만드는 것은 총무이고,
    팀원이 할 수 있는 일이 없는 자리에 버튼을 두면 눌러도 아무 일이 안 난다.
*/
export function SettlementEmpty({ isAdmin, onGoSchedule }: { isAdmin: boolean; onGoSchedule?: () => void }) {
  const { colors, styles } = useThemed(makeStyles);
  return (
    <View style={styles.wrap}>
      <View style={styles.icon}>
        <Ionicons name="wallet-outline" size={26} color={colors.green} />
      </View>
      <Text style={styles.title}>아직 정산할 경기가 없어요</Text>
      <Text style={styles.sub}>
        {isAdmin
          ? '경기가 끝나면 이 화면에서 회비를 나눠요. 경기운영에서 「경기 종료」를 누르면 여기로 이어집니다'
          : '총무가 정산을 등록하면 여기에 표시돼요'}
      </Text>
      {isAdmin && !!onGoSchedule && (
        <Pressable
          onPress={onGoSchedule}
          accessibilityRole="button"
          accessibilityLabel="일정에서 경기 만들기"
          style={({ pressed }) => [styles.action, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.actionText}>일정에서 경기 만들기</Text>
        </Pressable>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10, paddingVertical: 56 },
  icon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    // 홈의 빈 상태 아이콘과 같은 계열 — 두 탭이 같은 빈 상태를 다르게 그리면 안 된다
    backgroundColor: colors.greenTint,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.18)',
    marginBottom: 4,
  },
  title: { color: colors.text, fontSize: 15, fontWeight: '800' },
  /* 일정 탭 EmptyState의 버튼과 같은 모양 — 두 화면의 빈 상태가 다른 버튼을 그리면 안 된다 */
  action: {
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.greenTint,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.28)',
  },
  actionText: { color: colors.green, fontSize: 13, fontWeight: '800' },
  sub: { color: colors.textDim, fontSize: 12, fontWeight: '600', textAlign: 'center', lineHeight: 19 },
  });
