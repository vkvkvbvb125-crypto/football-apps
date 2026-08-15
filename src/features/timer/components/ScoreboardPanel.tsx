// src/features/timer/components/ScoreboardPanel.tsx — 쿼터 표시 + 종료 확인 수정판
// 점수는 AssignmentScreen에 끌어올린 상태를 그대로 받는다(controlled).
//
// ⚠ 수정 요약:
// 1) 몇 쿼터인지 안 보였다 — TimerPanel에는 쿼터 칩이 있는데 스코어 탭엔 없어서, 탭을 옮기면
//    맥락이 끊겼다. → 상단에 쿼터 + 리드 상태를 함께 표시(quarter prop 추가, 옵셔널).
// 2) "경기 종료 → 정산으로"가 확인 없이 한 번의 탭으로 matches.status를 completed로 바꿨다.
//    오탭이면 경기가 끝나버린다. → 확인 대화상자를 붙였다(components/Dialog).
// 3) 스코어 초기화도 확인 없이 즉시 0으로 밀었다 → 점수가 있을 때만 노출 + 확인.
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { confirmAction } from '../../../components/Dialog';
import { colors, radius } from '../../../theme';

interface Props {
  scoreA: number;
  scoreB: number;
  onChangeA: (score: number) => void;
  onChangeB: (score: number) => void;
  isAdmin: boolean;
  onFinish: () => void;
  /** 몇 쿼터 진행 중인지 — 없으면 표시하지 않는다 */
  quarter?: number;
  totalQuarters?: number;
}

function askThen(title: string, message: string, confirmLabel: string, onYes: () => void) {
  confirmAction({ title, message, confirmLabel, destructive: true }).then((ok) => {
    if (ok) onYes();
  });
}

export function ScoreboardPanel({
  scoreA,
  scoreB,
  onChangeA,
  onChangeB,
  isAdmin,
  onFinish,
  quarter,
  totalQuarters = 4,
}: Props) {
  const winner = scoreA === scoreB ? null : scoreA > scoreB ? 'A' : 'B';
  const hasScore = scoreA > 0 || scoreB > 0;

  const handleFinish = () =>
    askThen(
      '경기 종료',
      `최종 스코어 A팀 ${scoreA} : ${scoreB} B팀으로 경기를 종료할까요?\n종료하면 정산을 만들 수 있어요.`,
      '종료하기',
      onFinish
    );

  const handleReset = () =>
    askThen('스코어 초기화', '기록한 점수를 0으로 되돌릴까요?', '초기화', () => {
      onChangeA(0);
      onChangeB(0);
    });

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.head}>
          {quarter != null && (
            <>
              <View style={styles.quarterChip}>
                <Text style={styles.quarterText}>
                  {quarter}쿼터 / {totalQuarters}
                </Text>
              </View>
              <View style={styles.headDot} />
            </>
          )}
          <Text style={styles.headText}>{winner ? `${winner}팀 리드` : '동점'}</Text>
        </View>

        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={[styles.team, { color: colors.green }]}>A팀</Text>
            <Text style={[styles.score, winner === 'B' && styles.scoreDim]}>{scoreA}</Text>
            {isAdmin && (
              <View style={styles.btnRow}>
                <Pressable
                  onPress={() => onChangeA(Math.max(0, scoreA - 1))}
                  style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
                >
                  <Text style={styles.btnText}>−</Text>
                </Pressable>
                <Pressable
                  onPress={() => onChangeA(scoreA + 1)}
                  style={({ pressed }) => [styles.btn, styles.btnA, pressed && styles.pressed]}
                >
                  <Text style={[styles.btnText, { color: colors.green }]}>+</Text>
                </Pressable>
              </View>
            )}
          </View>

          <Text style={styles.vs}>VS</Text>

          <View style={styles.col}>
            <Text style={[styles.team, { color: colors.blue }]}>B팀</Text>
            <Text style={[styles.score, winner === 'A' && styles.scoreDim]}>{scoreB}</Text>
            {isAdmin && (
              <View style={styles.btnRow}>
                <Pressable
                  onPress={() => onChangeB(Math.max(0, scoreB - 1))}
                  style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
                >
                  <Text style={styles.btnText}>−</Text>
                </Pressable>
                <Pressable
                  onPress={() => onChangeB(scoreB + 1)}
                  style={({ pressed }) => [styles.btn, styles.btnB, pressed && styles.pressed]}
                >
                  <Text style={[styles.btnText, { color: colors.blue }]}>+</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        <Text style={styles.note}>기록한 점수는 이 화면을 벗어나면 초기화돼요</Text>
      </View>

      {isAdmin && (
        <>
          {hasScore && (
            <Pressable onPress={handleReset} style={({ pressed }) => [styles.reset, pressed && styles.pressed]}>
              <Text style={styles.resetText}>스코어 초기화</Text>
            </Pressable>
          )}

          <Pressable onPress={handleFinish} style={({ pressed }) => [styles.finish, pressed && styles.pressed]}>
            <Text style={styles.finishText}>경기 종료 → 정산으로</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, paddingBottom: 20 },
  pressed: { opacity: 0.8 },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.hero,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 18,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  quarterChip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: '#1B2A22' },
  quarterText: { color: colors.green, fontSize: 11, fontWeight: '800' },
  headDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.neutralFill },
  headText: { color: colors.textDim, fontSize: 11.5, fontWeight: '700' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  col: { flex: 1, alignItems: 'center', gap: 8 },
  team: { fontSize: 13, fontWeight: '800' },
  score: {
    color: colors.text,
    fontSize: 52,
    fontWeight: '800',
    letterSpacing: -2,
    lineHeight: 56,
    fontVariant: ['tabular-nums'],
  },
  scoreDim: { color: colors.textMuted },
  vs: { color: colors.neutralFill, fontSize: 13, fontWeight: '800' },

  btnRow: { flexDirection: 'row', gap: 6 },
  btn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: '#26332D',
  },
  btnA: { backgroundColor: '#1B2A22', borderColor: colors.greenDeep },
  btnB: { backgroundColor: 'rgba(96,165,250,0.10)', borderColor: '#2F4560' },
  btnText: { color: colors.textMuted, fontSize: 18, fontWeight: '700' },

  note: { color: colors.textFaint, fontSize: 10.5, fontWeight: '600', textAlign: 'center' },

  reset: {
    height: 48,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: '#26332D',
  },
  resetText: { color: colors.textStrong, fontSize: 13.5, fontWeight: '800' },

  /**
   * 경기 종료는 되돌릴 수 없는 동작이다 — 상태가 completed로 바뀌고 정산으로 넘어간다.
   * 초록 채움 버튼은 "다음으로 진행"처럼 읽혀서 눌러도 되는 것처럼 보였다.
   * 검정 바탕에 빨간 테두리만 남겨, 눈에는 띄되 손이 먼저 나가지는 않게 한다.
   */
  finish: {
    height: 50,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgRoot,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  finishText: { color: colors.danger, fontSize: 14, fontWeight: '800' },
});
