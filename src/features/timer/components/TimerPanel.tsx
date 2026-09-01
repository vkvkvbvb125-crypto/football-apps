// src/features/timer/components/TimerPanel.tsx — 타이머 가독성/터치 수정판
// 기존 기능 유지: 호루라기 사운드, 진동, 총무만 조작, 쿼터 길이 즉석 조정.
//
// ⚠ 수정 요약:
// 1) 시간 표시가 30px + "00:09:32"(시:분:초)라 작고 읽기 어려웠다 → 44px, 쿼터는 분:초만
//    (쿼터가 1시간을 넘는 경우에만 시간을 앞에 붙인다).
// 2) 컨트롤 버튼이 height 30~32px / font 11~13px로 최소 터치 영역(44px)에 크게 미달했다
//    → 46px 높이, flex 배치. 화면 폭 비율 하드코딩(SCREEN_WIDTH * 0.23)도 제거.
// 3) "경기 전"에 링을 0.475로 고정하던 눈속임을 없애고 실제 잔여 비율(1.0)을 보여준다.
// 4) 쿼터 길이 입력이 10px 회색 텍스트라 편집 가능한지 알 수 없었다 → 라벨 + 밑줄 강조.
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Vibration, View, useWindowDimensions } from 'react-native';
import { Text } from '../../../components/nativeText';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';
import { elapsedRatioOf, secondsLeft as secondsLeftOf, totalSecondsOf } from '../utils/timer';

const STROKE_WIDTH = 6;

/** 쿼터 길이 범위 — 풋살은 보통 5~15분이고, 그 밖은 실수로 누른 값에 가깝다 */
const MIN_QUARTER = 1;
const MAX_QUARTER = 60;

function formatTime(totalSeconds: number) {
  const clamped = Math.max(0, totalSeconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(clamped % 60)
    .toString()
    .padStart(2, '0');
  // 쿼터는 보통 10분 내외 — 시(hour)는 실제로 넘어갈 때만 표시한다
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

/** 경기 정보 카드의 한 칸 — 라벨 위, 값 아래 */
function InfoCell({ label, value }: { label: string; value: string }) {
  const { colors, styles } = useThemed(makeStyles);
  return (
    <View style={styles.infoCell}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

interface Props {
  /** 경기 생성 시 정한 쿼터 길이(분) — 시작값으로만 쓰고 총무가 여전히 조정할 수 있다 */
  initialQuarterMinutes: number;
  totalQuarters?: number;
  quarter: number;
  onQuarterEnd: () => void;
  scoreA: number;
  scoreB: number;
  onPressScore: () => void;
  isAdmin: boolean;
  /** 아래 「경기 정보」 카드에 쓰는 값들 */
  matchInfo?: { quarterMinutes: number; totalQuarters: number; teamCount: number };
}

export function TimerPanel({
  initialQuarterMinutes,
  totalQuarters = 4,
  quarter,
  onQuarterEnd,
  scoreA,
  scoreB,
  onPressScore,
  isAdmin,
  matchInfo,
}: Props) {
  const { colors, styles } = useThemed(makeStyles);
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const ringSize = Math.min(240, SCREEN_WIDTH * 0.64);
  const radius = (ringSize - STROKE_WIDTH) / 2;
  const circumference = 2 * Math.PI * radius;

  const [quarterMinutes, setQuarterMinutes] = useState(initialQuarterMinutes);
  const [remainingSeconds, setRemainingSeconds] = useState(quarterMinutes * 60);
  /*
   * 「+1분」으로 늘린 추가시간의 합.
   *
   * 이게 없으면 총 시간이 쿼터 길이에 고정돼서, 시간을 더한 순간 남은 시간이 총 시간을
   * 넘어선다. 그럼 지난 비율이 음수가 되고 링이 통째로 사라졌다.
   * 추가시간은 경기가 길어진 것이지 이미 흐른 시간이 되돌아간 게 아니므로,
   * 분자(지난 시간)가 아니라 분모(총 시간)가 같이 커져야 맞다.
   */
  const [addedSeconds, setAddedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /*
   * 끝나는 시각(epoch ms). 돌고 있을 때만 값이 있다.
   *
   * 예전엔 1초마다 remainingSeconds를 1씩 깎았다. 그러면 브라우저·OS가 백그라운드에서
   * 타이머를 늦추거나 멈출 때 시간이 실제보다 덜 흐른다 — 경기 중에 폰을 주머니에 넣는
   * 건 늘 있는 일이라, 돌아와 보면 남은 시간이 틀려 있었다.
   *
   * 이제 tick은 화면을 다시 그릴 뿐이고, 남은 시간은 항상 endsAt - now로 계산한다.
   * throttle이 걸려도 복귀하는 순간 옳은 값이 나온다.
   */
  const endsAtRef = useRef<number | null>(null);

  const player = useAudioPlayer(require('../../../../assets/sounds/whistle.mp3'));

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  /**
   * 휘슬 사이 간격.
   *
   * 이 값이 앞선 취주의 길이도 겸한다 — 다음 재생이 seekTo(0)으로 앞 소리를 끊기 때문이다.
   * 그래서 마지막 취주만 음원 전체(3.4초)로 울린다: 짧-짧-김.
   * 마지막을 더 길게 만들 방법은 없다(이미 파일 전체다). 대신 이 값을 줄이면
   * 앞의 둘이 짧아져서 마지막이 상대적으로 더 길게 들린다.
   *
   * 여러 방식을 시도했다가 이 방식으로 돌아왔다:
   *  - 3600ms(소리 전체 3.4초를 다 재생) → 세 번이면 11초라 늘어졌다
   *  - 짧게 두 번 + 길게 한 번(주심 리듬) → 긴 소리를 잘라 만들다 보니 어색했다
   *  - 끊을 때 볼륨 페이드 → 휘슬은 세기가 일정해서 "볼륨을 줄인다"로 들렸다
   *
   * 짧은 취주가 필요하면 whistle-short.mp3 같은 짧은 음원을 따로 두는 게 맞다.
   * 3.4초짜리 하나를 잘라 쓰는 한 어느 방식이든 티가 난다.
   */
  const WHISTLE_GAP_MS = 800;

  /** 예약된 휘슬들 — 초기화하거나 화면을 벗어나면 취소한다 */
  const whistleTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const stopWhistle = () => {
    whistleTimers.current.forEach(clearTimeout);
    whistleTimers.current = [];
  };

  const playWhistle = (times: number) => {
    stopWhistle();
    for (let i = 0; i < times; i++) {
      const id = setTimeout(() => {
        player.seekTo(0);
        player.play();
      }, i * WHISTLE_GAP_MS);
      whistleTimers.current.push(id);
    }
  };

  // 예약만 해두고 화면을 벗어나면 엉뚱한 데서 휘슬이 울린다
  useEffect(() => stopWhistle, []);

  /** endsAt으로부터 남은 초 — 식은 utils/timer.ts에 있다(검사가 같은 것을 본다) */
  const secondsLeft = () => secondsLeftOf(endsAtRef.current, remainingSeconds, Date.now());

  useEffect(() => {
    if (!isRunning) return;
    // 시작·재개하는 순간 도착 시각을 못 박는다
    if (endsAtRef.current == null) endsAtRef.current = Date.now() + remainingSeconds * 1000;

    const tick = () => {
      const left = secondsLeft();
      setRemainingSeconds(left);
      if (left <= 0) {
        endsAtRef.current = null;
        Vibration.vibrate(500);
        playWhistle(3);
        setIsRunning(false);
        onQuarterEnd();
      }
    };
    tick();
    intervalRef.current = setInterval(tick, 500);

    /*
     * 백그라운드에서 돌아오면 즉시 다시 계산한다.
     * interval이 살아 있어도 다음 tick까지 최대 0.5초 옛 숫자가 보이는데,
     * 3분 잠갔다 켠 직후에 옛 숫자가 스치면 시간이 안 간 것처럼 보인다.
     */
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') tick();
    });
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      sub.remove();
    };
  }, [isRunning]);

  // 쿼터가 바뀌면(다음 쿼터로 넘어가면) 새 쿼터 길이로 리셋 — 추가시간도 같이 털어낸다
  useEffect(() => {
    setIsRunning(false);
    endsAtRef.current = null;
    setRemainingSeconds(quarterMinutes * 60);
    setAddedSeconds(0);
  }, [quarter]);

  const handleStartPause = () => {
    if (isRunning) {
      // 일시정지 — 남은 시간을 확정해 두고 도착 시각은 버린다
      setRemainingSeconds(secondsLeft());
      endsAtRef.current = null;
    } else {
      playWhistle(1);
    }
    setIsRunning((r) => !r);
  };

  const handleReset = () => {
    // 종료 휘슬이 울리는 중에 초기화하면 남은 휘슬도 같이 멈춰야 한다
    stopWhistle();
    setIsRunning(false);
    endsAtRef.current = null;
    setRemainingSeconds(quarterMinutes * 60);
    setAddedSeconds(0);
  };

  const handleMinutesChange = (text: string) => {
    const value = Number(text) || 0;
    setQuarterMinutes(value);
    // 시작 전에 쿼터 길이를 다시 정하는 건 새 판을 짜는 것 — 쌓인 추가시간은 의미가 없다
    if (!isRunning) {
      endsAtRef.current = null;
      setRemainingSeconds(value * 60);
      setAddedSeconds(0);
    }
  };

  const handleAddMinute = () => {
    setAddedSeconds((prev) => prev + 60);
    setRemainingSeconds((prev) => prev + 60);
    // 돌고 있는 중이면 도착 시각도 같이 밀어야 한다 — 안 그러면 다음 tick이 되돌린다
    if (endsAtRef.current != null) endsAtRef.current += 60_000;
  };

  const totalSeconds = totalSecondsOf(quarterMinutes, addedSeconds);
  const isFresh = remainingSeconds === totalSeconds;
  const stateLabel =
    remainingSeconds === 0 ? '쿼터 종료' : isRunning ? '진행 중' : isFresh ? '경기 전' : '일시정지';
  /**
   * 링은 "지나간 시간"만큼 찬다.
   *
   * 예전엔 남은 시간 비율이라 시작하면 꽉 찬 원이 점점 비었다 — 시계보다 배터리에 가까웠다.
   * 경기가 진행될수록 차오르는 쪽이 "얼마나 왔나"를 바로 읽게 해준다.
   */
  /*
   * clamp는 남겨 둔다 — 다만 이제 이건 안전망이지 대책이 아니다.
   *
   * 예전엔 totalSeconds가 쿼터 길이에 고정돼 있어서 "+1분"을 누르면 남은 시간이
   * 총 시간을 넘었고, 음수가 된 비율이 여기서 0으로 잘리면서 링이 통째로 사라졌다.
   * clamp가 "링이 엉뚱하게 그려지는" 증상만 덮고 원인(분모가 안 자라는 것)은 놔둔 셈이다.
   * totalSeconds가 추가시간을 품게 된 지금은 이 식이 음수가 될 일이 없다.
   */
  const elapsedRatio = elapsedRatioOf(totalSeconds, remainingSeconds);
  const strokeDashoffset = circumference * (1 - elapsedRatio);

  return (
    <View style={styles.content}>
      <View style={styles.head}>
        <View style={styles.quarterChip}>
          <Text style={styles.quarterText}>{quarter}쿼터</Text>
        </View>
        <Text style={styles.headSub}>
          쿼터 {quarterMinutes}분 · {totalQuarters}쿼터 중 {quarter}번째
        </Text>
      </View>

      {/* 링 안에서 돌던 입자 구(ParticleSphere)는 걷어냈다 —
          남은 시간을 읽는 화면인데 배경이 계속 움직여서 숫자보다 먼저 눈에 들어왔다. */}
      {/*
        링은 앱 아이콘의 심(seam)과 같은 역할이다 — 검정 면 위에서 이것만 빛난다.
        멈춰 있을 때와 도는 동안을 색으로 가른다(스펙 11절): 멈춰 있으면 심이 식어 있고,
        도는 동안에만 밝은 네온이 되고 아주 약한 halo가 바깥으로 번진다.
        예전엔 상태와 무관하게 늘 같은 초록이라, 화면만 보고는 도는 중인지 알 수 없었다.
      */}
      <View style={[styles.ringSection, { width: ringSize, height: ringSize }]}>
        <Svg width={ringSize} height={ringSize}>
          {/*
            채워지는 호를 단색이 아니라 그라디언트로 긋는다.

            아이콘 공의 심은 한 색이 아니다 — 밝게 타는 지점에서 그늘진 면 쪽으로
            떨어진다. 단색 stroke는 그 결이 없어서 초록 철사처럼 보였다.
            시작점(12시, 갓 지난 시간)이 깊고 끝(현재 지점)이 밝아서, 진행하는 끝이
            타오르는 것처럼 읽힌다.
          */}
          <Defs>
            <SvgGradient id="timerArc" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={colors.greenCore} />
              <Stop offset="1" stopColor={isRunning ? colors.greenBright : colors.green} />
            </SvgGradient>
          </Defs>
          <Circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            stroke={colors.greenTrack}
            strokeWidth={STROKE_WIDTH}
            fill="none"
          />
          {/*
            도는 동안의 halo.

            처음엔 컨테이너 View에 boxShadow를 걸었는데, 그 View는 SVG를 담는 정사각형이라
            빛이 원이 아니라 네모로 그려졌다 — 타이머를 시작하면 화면에 사각형이 떠올랐다.
            그림자는 원이 아니라 컨테이너 경계를 따라간다.

            대신 같은 호를 굵게 한 번 더 긋는다. 경로가 같으니 사각형이 나올 수가 없고,
            아직 지나지 않은 구간에는 빛이 없어서 "탄 자리만 밝다"는 아이콘의 결과도 맞는다.
            채워지는 호보다 먼저 그려야 뒤에 깔린다.
          */}
          {isRunning && (
            <Circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              stroke={colors.green}
              strokeWidth={STROKE_WIDTH * 3}
              strokeOpacity={0.16}
              strokeLinecap="round"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={strokeDashoffset}
              fill="none"
              transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
            />
          )}
          <Circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            stroke={isRunning ? 'url(#timerArc)' : colors.greenDeep}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            fill="none"
            transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
          />
        </Svg>

        <View style={styles.ringCenter} pointerEvents="box-none">
          <Text style={styles.stateLabel}>{stateLabel}</Text>
          <Text style={styles.timeDisplay}>{formatTime(remainingSeconds)}</Text>
          {/* 쿼터 길이 조절은 시작 전에만 — 한 번 돌린 뒤에는 아래 "+1분"(추가시간)이 그 역할을 한다.
              둘을 같이 두면 분을 더하는 버튼이 둘이 되어 무엇이 총 시간인지 알 수 없어진다.

              폰에서 숫자를 직접 치게 하지 않는 이유: 칸이 좁아 누르기 힘들고, 탭해도 전체 선택이
              안 돼 "10"에 8을 치면 108이 된다. iOS 숫자 키패드엔 완료 버튼도 없다. */}
          {isAdmin && isFresh ? (
            <View style={styles.quarterEditRow}>
              <Pressable
                disabled={quarterMinutes <= MIN_QUARTER}
                onPress={() => handleMinutesChange(String(quarterMinutes - 1))}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.stepBtn,
                  quarterMinutes <= MIN_QUARTER && styles.stepBtnOff,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="쿼터 1분 줄이기"
              >
                <Ionicons name="remove" size={14} color={colors.green} />
              </Pressable>

              <Text style={styles.quarterStatic}>{quarterMinutes}분</Text>

              <Pressable
                disabled={quarterMinutes >= MAX_QUARTER}
                onPress={() => handleMinutesChange(String(quarterMinutes + 1))}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.stepBtn,
                  quarterMinutes >= MAX_QUARTER && styles.stepBtnOff,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="쿼터 1분 늘리기"
              >
                <Ionicons name="add" size={14} color={colors.green} />
              </Pressable>
            </View>
          ) : (
            // 시작한 뒤엔 원래 쿼터 길이를 글자로만 보여준다 — 지금 몇 분짜리인지는 알아야 한다
            <Text style={styles.quarterStatic}>{quarterMinutes}분</Text>
          )}
        </View>
      </View>

      {isAdmin && (
        <View style={styles.controlRow}>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            onPress={handleReset}
          >
            <Ionicons name="refresh-outline" size={15} color={colors.textMuted} />
            <Text style={styles.secondaryButtonText}>초기화</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              isRunning && styles.primaryButtonPause,
              pressed && styles.pressed,
            ]}
            onPress={handleStartPause}
          >
            <Text style={[styles.primaryButtonText, isRunning && styles.primaryButtonTextPause]}>
              {isRunning ? '일시정지' : isFresh ? '시작' : '계속'}
            </Text>
          </Pressable>

          {/* 추가시간 — 시작한 뒤에만 뜬다.
              시작 전에는 링 안의 −/+ 로 쿼터 길이를 정하고, 시작한 뒤에는 이 버튼으로 더한다.
              둘이 같이 보이면 "분을 더하는 버튼"이 둘이라 뭘 눌러야 할지 알 수 없고,
              실제로 "쿼터 6분인데 7:00 남음" 같은 어긋난 상태가 만들어졌다. */}
          <Pressable
            disabled={isFresh}
            style={({ pressed }) => [styles.secondaryButton, isFresh && styles.secondaryButtonOff, pressed && styles.pressed]}
            onPress={handleAddMinute}
          >
            <Ionicons name="add" size={15} color={colors.textMuted} />
            <Text style={styles.secondaryButtonText}>1분</Text>
          </Pressable>
        </View>
      )}

      {/* 경기 정보 — 타이머만 보고 있으면 "총 몇 분짜리인지, 몇 쿼터인지"를 알 수 없다.
          스코어 요약도 이 카드 안에 넣어 아래쪽을 카드 하나로 정리한다. */}
      {!!matchInfo && (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>경기 정보</Text>
          <View style={styles.infoRow}>
            <InfoCell label="총 경기시간" value={`${matchInfo.quarterMinutes * matchInfo.totalQuarters}분`} />
            <InfoCell label="쿼터 시간" value={`${matchInfo.quarterMinutes}분`} />
            <InfoCell label="쿼터 수" value={`${matchInfo.totalQuarters}쿼터`} />
            <InfoCell label="팀 수" value={`${matchInfo.teamCount}팀`} />
          </View>

          <View style={styles.infoDivider} />

          <View style={styles.scoreRow}>
            <Text style={styles.scoreText}>
              A팀 {scoreA} : {scoreB} B팀
            </Text>
            <Pressable onPress={onPressScore} hitSlop={8}>
              <Text style={styles.scoreLink}>스코어 기록 ›</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  content: { alignItems: 'center' },
  pressed: { opacity: 0.85 },

  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  quarterChip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.greenTint },
  quarterText: { color: colors.green, fontSize: 11, fontWeight: '800' },
  headSub: { color: colors.textDim, fontSize: 11, fontWeight: '600' },

  ringSection: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  ringCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  timeDisplay: {
    marginTop: 4,
    color: colors.text,
    fontSize: 44,
    lineHeight: 50,
    fontWeight: '800',
    letterSpacing: -1.5,
    fontVariant: ['tabular-nums'],
  },
  quarterEditRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  /** −/+ 단추 — 손가락으로 누를 수 있게 28px에 hitSlop 10을 더한다 */
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.greenTint,
    borderWidth: 1,
    borderColor: colors.greenDeep,
  },
  stepBtnOff: { opacity: 0.35 },
  secondaryButtonOff: { opacity: 0.35 },
  quarterStatic: {
    minWidth: 42,
    textAlign: 'center',
    color: colors.textStrong,
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },

  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    marginTop: 18,
  },
  secondaryButton: {
    height: 46,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 14,
    backgroundColor: colors.overlaySoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  primaryButton: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.greenTimer,
  },
  primaryButtonPause: {
    backgroundColor: 'rgba(210,163,76,0.16)',
    borderWidth: 1,
    borderColor: colors.goldLine,
  },
  primaryButtonText: { color: colors.bgRoot, fontSize: 14, fontWeight: '800' },
  primaryButtonTextPause: { color: colors.gold },

  /** 경기 정보 카드 — 타이머 아래에 붙는다 */
  infoCard: {
    width: '100%',
    marginTop: 18,
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoTitle: { color: colors.textStrong, fontSize: 13, fontWeight: '800', marginBottom: 12 },
  infoRow: { flexDirection: 'row' },
  infoCell: { flex: 1, gap: 5 },
  infoLabel: { color: colors.textDim, fontSize: 10, fontWeight: '700' },
  infoValue: { color: colors.text, fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  infoDivider: { height: 1, backgroundColor: colors.divider, marginTop: 14 },

  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: 12,
  },
  scoreText: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  scoreLink: { color: colors.green, fontSize: 11, fontWeight: '700' },
  });
