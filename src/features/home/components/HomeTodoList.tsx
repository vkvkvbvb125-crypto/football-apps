// src/features/home/components/HomeTodoList.tsx — 홈의 "해야 할 일"
//
// 빈 팀의 홈은 "예정된 경기가 없습니다 / 정산 내역이 없습니다"로 채워져 있었다.
// 같은 사실을 "없다"가 아니라 "하면 된다"로 쓴다 — 화면이 채워지고, 새 사용자가
// 다음에 뭘 눌러야 하는지 알게 된다.
//
// 새 정보를 만들지 않는다. 전부 홈이 이미 들고 있는 값에서 나온다.
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../../components/nativeText';
import { colors, radius } from '../../../theme';

export interface HomeTodo {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  sub: string;
  /** 왼쪽 테두리 색 — 급한 것과 설정류를 눈으로 가른다 */
  tint: string;
  onPress: () => void;
}

export function HomeTodoList({ todos }: { todos: HomeTodo[] }) {
  if (todos.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>해야 할 일</Text>
        <View style={styles.countDot} />
        <Text style={styles.count}>{todos.length}건</Text>
      </View>

      {todos.map((t) => (
        <Pressable
          key={t.key}
          onPress={t.onPress}
          style={({ pressed }) => [styles.row, { borderLeftColor: t.tint }, pressed && styles.pressed]}
        >
          <Ionicons name={t.icon} size={17} color={t.tint} />
          <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <Text style={styles.rowTitle}>{t.title}</Text>
            <Text style={styles.rowSub} numberOfLines={1}>
              {t.sub}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={15} color={colors.textDim} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  title: { color: colors.text, fontSize: 15, fontWeight: '800', letterSpacing: -0.2, flex: 1 },
  countDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.danger },
  count: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },

  /**
   * 왼쪽 테두리 색으로 종류를 가른다 — 카드를 색으로 다 칠하면 목록이 얼룩덜룩해지고,
   * 색이 없으면 다섯 줄이 한 덩어리로 뭉친다. 가장자리 한 줄이 그 사이다.
   */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radius.button,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
  },
  pressed: { opacity: 0.85 },
  rowTitle: { color: colors.textStrong, fontSize: 13.5, fontWeight: '800' },
  rowSub: { color: colors.textDim, fontSize: 11.5, fontWeight: '600' },
});
