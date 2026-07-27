// src/features/timer/components/ScoreboardPanel.tsx — 리디자인 적용판
// 점수는 AssignmentScreen에 끌어올린 상태를 그대로 받는다(controlled) — TimerPanel의
// "스코어 기록 →" 요약과 같은 값을 공유하기 위함. 점수 자체는 DB에 저장하는 곳이 없어서
// 이 화면을 벗어나면(경기운영 탭 이탈) 사라진다 — "경기 종료" 버튼만 실제로 matches.status를
// completed로 바꾼다.
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { colors, radius } from '../../../theme';

interface Props {
  scoreA: number;
  scoreB: number;
  onChangeA: (score: number) => void;
  onChangeB: (score: number) => void;
  isAdmin: boolean;
  onFinish: () => void;
}

export function ScoreboardPanel({ scoreA, scoreB, onChangeA, onChangeB, isAdmin, onFinish }: Props) {
  const winner = scoreA === scoreB ? null : scoreA > scoreB ? 'A' : 'B';

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.head}>
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
      </View>

      {isAdmin && (
        <>
          <Pressable
            onPress={() => {
              onChangeA(0);
              onChangeB(0);
            }}
            style={({ pressed }) => [styles.reset, pressed && styles.pressed]}
          >
            <Text style={styles.resetText}>스코어 초기화</Text>
          </Pressable>

          <Pressable onPress={onFinish} style={({ pressed }) => [styles.finish, pressed && styles.pressed]}>
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
  head: { alignItems: 'center' },
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
    height: 40,
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

  finish: {
    height: 48,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green,
  },
  finishText: { color: colors.bgRoot, fontSize: 13.5, fontWeight: '800' },
});
