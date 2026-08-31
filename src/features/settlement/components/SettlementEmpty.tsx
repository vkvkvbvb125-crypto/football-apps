// src/features/settlement/components/SettlementEmpty.tsx
// 정산 이력이 아예 없는 팀의 빈 상태.
//
// "정산 미등록" 경기 카드는 별도 컴포넌트가 아니라 SettlementCard의 pending variant다
// (Reference 규칙: 하나의 컴포넌트에 variant만 둔다).
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { radius, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';

export function SettlementEmpty({ isAdmin }: { isAdmin: boolean }) {
  const { colors, styles } = useThemed(makeStyles);
  return (
    <View style={styles.wrap}>
      <View style={styles.icon}>
        <Ionicons name="wallet-outline" size={26} color={colors.green} />
      </View>
      <Text style={styles.title}>아직 정산할 경기가 없어요</Text>
      <Text style={styles.sub}>
        {isAdmin ? '경기가 끝나면 이 화면에서 회비를 정산할 수 있어요' : '총무가 정산을 등록하면 여기에 표시돼요'}
      </Text>
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
  sub: { color: colors.textDim, fontSize: 12, fontWeight: '600', textAlign: 'center', lineHeight: 19 },
  });
