// src/features/settings/screens/ThemeSettingsScreen.tsx — 화면 모드
//
// 설정 화면의 「화면 모드 ›」에서 들어온다.
//
// 셋 중 하나를 고른다. 「기기 설정 따르기」가 기본이다 — 고른 적 없는 사람에게
// 우리 취향을 강요하지 않는다. 기기 설정이 이미 그 사람의 답이다.
//
// ⚠ 고르는 즉시 화면이 바뀐다. 「저장」 버튼을 두지 않았다 — 무엇을 고르는지가
//   화면 그 자체라서, 눌러보는 것이 곧 미리보기다. 저장 버튼이 있으면 미리보기와
//   확정이 갈려서 「지금 보이는 게 저장된 건가」를 묻게 된다.
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../../components/nativeText';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { radius, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';
import { useThemeStore, type ThemeChoice } from '../../../lib/themeStore';

const OPTIONS: { value: ThemeChoice; label: string; hint: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'system', label: '기기 설정 따르기', hint: '휴대폰 설정이 바뀌면 같이 바뀌어요', icon: 'phone-portrait-outline' },
  { value: 'light', label: '밝게', hint: '항상 밝은 화면', icon: 'sunny-outline' },
  { value: 'dark', label: '어둡게', hint: '항상 어두운 화면', icon: 'moon-outline' },
];

export function ThemeSettingsScreen({ navigation }: any) {
  const { colors, styles } = useThemed(makeStyles);
  const choice = useThemeStore((s) => s.choice);
  const setChoice = useThemeStore((s) => s.setChoice);

  return (
    <ScreenGradient>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.textStrong} />
        </Pressable>
        <Text style={styles.headerTitle}>화면 모드</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.group}>
          {OPTIONS.map((o, i) => {
            const on = choice === o.value;
            return (
              <Pressable
                key={o.value}
                onPress={() => setChoice(o.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={o.label}
                style={({ pressed }) => [
                  styles.row,
                  i < OPTIONS.length - 1 && styles.rowDivided,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name={o.icon} size={19} color={on ? colors.green : colors.textMuted} />
                <View style={styles.textCol}>
                  <Text style={[styles.label, on && styles.labelOn]}>{o.label}</Text>
                  <Text style={styles.hint}>{o.hint}</Text>
                </View>
                {/* 체크는 고른 것에만. 라디오 원을 셋 다 그리면 안 고른 둘도 눌러야 할 것처럼 보인다 */}
                {on && <Ionicons name="checkmark" size={19} color={colors.green} />}
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.note}>
          이 기기에만 적용돼요. 다른 기기에서는 따로 정합니다
        </Text>
      </ScrollView>
    </ScreenGradient>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 56,
      paddingBottom: 12,
    },
    headerTitle: { color: colors.textStrong, fontSize: 17, fontWeight: '800' },
    pressed: { opacity: 0.8 },
    body: { padding: 20, paddingBottom: 60, gap: 14 },
    group: {
      backgroundColor: colors.card,
      borderRadius: radius.card,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 16, paddingVertical: 15 },
    rowDivided: { borderBottomWidth: 1, borderBottomColor: colors.divider },
    textCol: { flex: 1, gap: 2 },
    label: { color: colors.textBody, fontSize: 14, fontWeight: '600' },
    labelOn: { color: colors.textStrong, fontWeight: '800' },
    hint: { color: colors.textMuted, fontSize: 12 },
    note: { color: colors.textFaint, fontSize: 11, fontWeight: '600', marginLeft: 4 },
  });
