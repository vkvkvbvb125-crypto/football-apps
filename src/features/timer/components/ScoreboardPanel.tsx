// src/features/timer/components/ScoreboardPanel.tsx — 쿼터 표시 + 종료 확인 수정판
// 점수는 AssignmentScreen에 끌어올린 상태를 그대로 받는다(controlled).
//
// ⚠ 수정 요약:
// 1) 몇 쿼터인지 안 보였다 — TimerPanel에는 쿼터 칩이 있는데 스코어 탭엔 없어서, 탭을 옮기면
//    맥락이 끊겼다. → 상단에 쿼터 + 리드 상태를 함께 표시(quarter prop 추가, 옵셔널).
// 2) "경기 종료 → 정산으로"가 확인 없이 한 번의 탭으로 matches.status를 completed로 바꿨다.
//    오탭이면 경기가 끝나버린다. → 확인 대화상자를 붙였다(components/Dialog).
// 3) 스코어 초기화도 확인 없이 즉시 0으로 밀었다 → 점수가 있을 때만 노출 + 확인.
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { confirmAction } from '../../../components/Dialog';
import { radius, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';
import { SoftTint } from '../../../components/BentoCard';

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
  /**
   * 점수를 못 읽은 상태.
   *
   * 이때 +/− 와 초기화를 막는다. 화면이 들고 있는 0은 「진짜 0」이 아니라 「못 읽은 0」이라,
   * 거기서 +를 누르면 1이 서버 값을 덮는다. 초기화는 더 나쁘다 — 읽지도 않고 0을 보내는데
   * 「초기화했으니 0이 맞다」로 읽혀서 나중에도 안 걸린다.
   *
   * 카드 전체를 로딩으로 덮지 않는다. 이 화면의 주 기능은 타이머고 점수는 곁이다 —
   * 점수를 못 읽었다고 타이머까지 못 쓰면 경기가 멈춘다.
   */
  scoreUnavailable?: boolean;
  loadingScores?: boolean;
  /** 다시 읽기. 자동 재시도는 안 넣는다 — 근거는 scoreStore.loadScores 주석에 있다 */
  onRetryLoad?: () => void;
  /**
   * 저장 실패 문구.
   *
   * 점수는 낙관적으로 먼저 화면에 반영되므로, 서버 저장이 실패하면 숫자가 되돌아간다.
   * 그때 아무 말도 없으면 "내가 잘못 눌렀나"가 된다 — 되돌아간 이유를 여기 적는다.
   */
  saveError?: string | null;
  onDismissError?: () => void;
}

function askThen(
  title: string,
  message: string,
  confirmLabel: string,
  onYes: () => void,
  destructive = true
) {
  confirmAction({ title, message, confirmLabel, destructive }).then((ok) => {
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
  saveError,
  onDismissError,
  scoreUnavailable = false,
  loadingScores = false,
  onRetryLoad,
}: Props) {
  const { colors, styles } = useThemed(makeStyles);
  const winner = scoreA === scoreB ? null : scoreA > scoreB ? 'A' : 'B';
  const hasScore = scoreA > 0 || scoreB > 0;

  /*
    destructive: false 다.
    이 플래그는 대화상자의 확인 버튼을 빨갛게 만든다 — 삭제·취소용 표시다.
    경기 종료는 되돌리기 어렵지만 파괴가 아니라 다음 단계라, 확인은 남기되 색은 중립으로.
    (스코어 초기화는 실제로 기록을 지우므로 destructive를 유지한다.)
  */
  const handleFinish = () =>
    askThen(
      '경기 종료',
      `최종 스코어 A팀 ${scoreA} : ${scoreB} B팀으로 경기를 종료할까요?\n종료하면 정산을 만들 수 있어요.`,
      '종료하기',
      onFinish,
      false
    );

  /** 못 읽었으면 손대지 않는다 — 화면의 0이 서버 값을 덮는다 */
  const locked = scoreUnavailable || loadingScores;

  const handleReset = () =>
    askThen('스코어 초기화', '기록한 점수를 0으로 되돌릴까요?', '초기화', () => {
      onChangeA(0);
      onChangeB(0);
    });

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        {/* 카드 면의 결 — 정산 카드와 같은 값·같은 방향. 목록에서 조명이 하나로 읽힌다 */}
        <SoftTint tone="green" radius={radius.hero} />
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
            <Text style={styles.team}>A팀</Text>
            <Text style={[styles.score, winner === 'B' && styles.scoreDim]}>{scoreA}</Text>
            {isAdmin && (
              <View style={styles.btnRow}>
                <Pressable
                  onPress={() => onChangeA(Math.max(0, scoreA - 1))}
                  disabled={locked}
                  style={({ pressed }) => [styles.btn, locked && styles.btnOff, pressed && styles.pressed]}
                >
                  <Text style={[styles.btnText, locked && styles.btnTextOff]}>−</Text>
                </Pressable>
                <Pressable
                  onPress={() => onChangeA(scoreA + 1)}
                  disabled={locked}
                  style={({ pressed }) => [styles.btn, styles.btnPlus, locked && styles.btnOff, pressed && styles.pressed]}
                >
                  <Text style={[styles.btnTextOn, locked && styles.btnTextOff]}>+</Text>
                </Pressable>
              </View>
            )}
          </View>

          <Text style={styles.vs}>VS</Text>

          <View style={styles.col}>
            <Text style={styles.team}>B팀</Text>
            <Text style={[styles.score, winner === 'A' && styles.scoreDim]}>{scoreB}</Text>
            {isAdmin && (
              <View style={styles.btnRow}>
                <Pressable
                  onPress={() => onChangeB(Math.max(0, scoreB - 1))}
                  disabled={locked}
                  style={({ pressed }) => [styles.btn, locked && styles.btnOff, pressed && styles.pressed]}
                >
                  <Text style={[styles.btnText, locked && styles.btnTextOff]}>−</Text>
                </Pressable>
                <Pressable
                  onPress={() => onChangeB(scoreB + 1)}
                  disabled={locked}
                  style={({ pressed }) => [styles.btn, styles.btnPlus, locked && styles.btnOff, pressed && styles.pressed]}
                >
                  <Text style={[styles.btnTextOn, locked && styles.btnTextOff]}>+</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/*
          "이 화면을 벗어나면 초기화돼요"가 있던 자리.
          이제 점수는 match_scores에 남는다 — 안내가 사실이 아니게 됐다.
          대신 저장이 실패했을 때만 말한다.
        */}
        {/*
          점수를 못 읽었을 때. 카드 안에만 뜨고 타이머는 그대로 돈다.

          「다시 시도」를 사람이 누른다. 자동 재시도를 걸면 경기 중 몇 분이고 열려 있는
          화면에서 배경 폴링이 계속 돌아 배터리를 먹는다 — 그 판단의 근거는
          scoreStore.loadScores 주석에 있다.
        */}
        {scoreUnavailable && (
          <View style={styles.saveErr}>
            <Ionicons name="cloud-offline-outline" size={14} color={colors.danger} />
            <Text style={styles.saveErrText}>점수를 불러오지 못했어요</Text>
            {!!onRetryLoad && (
              <Pressable onPress={onRetryLoad} hitSlop={8} accessibilityRole="button" accessibilityLabel="점수 다시 불러오기">
                <Text style={styles.retryText}>{loadingScores ? '불러오는 중…' : '다시 시도'}</Text>
              </Pressable>
            )}
          </View>
        )}

        {!!saveError && (
          <Pressable onPress={onDismissError} accessibilityRole="button" style={styles.saveErr}>
            <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
            <Text style={styles.saveErrText}>{saveError}</Text>
          </Pressable>
        )}
      </View>

      {/*
        버튼 둘을 한 묶음으로 감싼다. 예전엔 카드와 같은 gap(12)으로 나란히 놓여서
        [카드] [초기화] [종료] 셋이 같은 간격이었다 — 카드와 버튼 사이가 섹션 경계인데
        초기화와 종료 사이(같은 묶음)와 구분이 안 됐다.
      */}
      {isAdmin && (
        <View style={styles.actions}>
          {hasScore && (
            <Pressable
              onPress={handleReset}
              disabled={locked}
              style={({ pressed }) => [styles.reset, locked && styles.btnOff, pressed && styles.pressed]}
            >
              <Text style={[styles.resetText, locked && styles.btnTextOff]}>스코어 초기화</Text>
            </Pressable>
          )}

          {/*
            정상 흐름이라 초록이다. 빨간 테두리(danger)였는데, danger는 삭제·취소처럼
            되돌릴 수 없는 파괴적 동작에 쓰는 색이다. 경기를 끝내고 정산으로 넘어가는 건
            이 앱이 기대하는 다음 단계다.

            확인 대화상자는 남긴다 — 색과 확인은 다른 축이다.
            색은 「정상 흐름인가」, 확인은 「되돌릴 수 없는가」를 말한다. 경기 상태가
            completed로 넘어가면 되돌리기 어렵고 타이머·스코어가 같이 끝난다.
          */}
          <Pressable onPress={handleFinish} style={({ pressed }) => [styles.finish, pressed && styles.pressed]}>
            <Text style={styles.finishText}>경기 종료 → 정산으로</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  wrap: { gap: 16, paddingBottom: 20 },
  /** 초기화·종료 묶음 — 카드와의 간격(16)보다 안쪽이 좁아야 한 묶음으로 읽힌다 */
  actions: { gap: 8 },
  pressed: { opacity: 0.8 },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.hero,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 18,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  quarterChip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.greenTint },
  quarterText: { color: colors.green, fontSize: 11, fontWeight: '800' },
  headDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.neutralFill },
  headText: { color: colors.textDim, fontSize: 11, fontWeight: '700' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  /** gap 8 → 6. 숫자가 커진 만큼 팀 이름과 붙여야 한 덩어리로 읽힌다 */
  col: { flex: 1, alignItems: 'center', gap: 6 },
  /*
   * 팀 이름은 보조다 — 800이면 색까지 있어서 숫자와 세기를 다툰다.
   * 색(초록/파랑)은 팀 분배 화면의 GROUP_COLOR와 같은 뜻이라 남긴다.
   */
  /*
   * 팀 이름에 색을 쓰지 않는다.
   *
   * A팀 초록 / B팀 파랑이었다. 파랑이 브랜드 그린과 같은 위계로 들어와서, 이 화면에서만
   * 초록이 「A팀」을 뜻하게 됐다 — 다른 화면에서 초록은 활성·성공·CTA다.
   * 팀은 좌우로 갈려 있고 이름이 적혀 있어 색 없이도 헷갈리지 않는다.
   * 3~5팀으로 늘어나도 색 다섯 개를 새로 정할 필요가 없다: 라벨이 늘어날 뿐이다.
   *
   * 팀 분배 화면의 GROUP_COLOR는 남긴다 — 거기선 5개 칸이 한 화면에 나란히 있어
   * 색이 실제로 구분에 쓰인다.
   */
  team: { color: colors.textBody, fontSize: 12, fontWeight: '700' },
  /*
   * 이 화면의 주인공. 52 → 64.
   * 스코어보드를 열었을 때 눈이 처음 닿아야 하는 게 점수인데, 52는 정산 금액(30)이나
   * 타이머(48)와 같은 층으로 읽혔다. 한 층 위로 올려 다툼을 없앤다.
   */
  score: {
    color: colors.text,
    fontSize: 64,
    fontWeight: '800',
    letterSpacing: -2.5,
    lineHeight: 68,
    fontVariant: ['tabular-nums'],
  },
  scoreDim: { color: colors.textMuted },
  vs: { color: colors.neutralFill, fontSize: 13, fontWeight: '800' },

  btnRow: { flexDirection: 'row', gap: 6 },
  btn: {
    width: 44,
    height: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  /** 양 팀 「+」는 같은 모양 — 어느 쪽 점수를 올리는지는 좌우 위치가 말한다 */
  btnPlus: { backgroundColor: colors.greenTint, borderColor: colors.greenDeep },
  btnText: { color: colors.textMuted, fontSize: 17, fontWeight: '700' },
  btnTextOn: { color: colors.green, fontSize: 17, fontWeight: '700' },

  /* 못 읽었을 때의 버튼 — 눌러도 서버 값을 덮을 뿐이라 아예 못 누르게 한다 */
  btnOff: { opacity: 0.35 },
  btnTextOff: { color: colors.textFaint },
  retryText: { color: colors.green, fontSize: 12, fontWeight: '800' },
  saveErr: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.control,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.dangerTint,
  },
  saveErrText: { color: colors.danger, fontSize: 11, fontWeight: '700' },

  reset: {
    height: 48,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  resetText: { color: colors.textStrong, fontSize: 13, fontWeight: '800' },

  /**
   * 경기 종료는 되돌릴 수 없는 동작이다 — 상태가 completed로 바뀌고 정산으로 넘어간다.
   * 초록 채움 버튼은 "다음으로 진행"처럼 읽혀서 눌러도 되는 것처럼 보였다.
   * 검정 바탕에 빨간 테두리만 남겨, 눈에는 띄되 손이 먼저 나가지는 않게 한다.
   */
  finish: {
    height: 50,
    borderRadius: radius.button,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.greenTint,
    borderWidth: 1,
    borderColor: colors.greenDeep,
  },
  finishText: { color: colors.green, fontSize: 14, fontWeight: '800' },
  });
