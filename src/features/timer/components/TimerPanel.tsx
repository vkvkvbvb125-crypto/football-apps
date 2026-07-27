// src/features/timer/components/TimerPanel.tsx — 타이머 가독성/터치 수정판
// 기존 기능 100% 유지: 호루라기 사운드, 진동, ParticleSphere, 총무만 조작, 쿼터 길이 즉석 수정.
//
// ⚠ 수정 요약:
// 1) 시간 표시가 30px + "00:09:32"(시:분:초)라 작고 읽기 어려웠다 → 44px, 쿼터는 분:초만
//    (쿼터가 1시간을 넘는 경우에만 시간을 앞에 붙인다).
// 2) 컨트롤 버튼이 height 30~32px / font 11~13px로 최소 터치 영역(44px)에 크게 미달했다
//    → 46px 높이, flex 배치. 화면 폭 비율 하드코딩(SCREEN_WIDTH * 0.23)도 제거.
// 3) "경기 전"에 링을 0.475로 고정하던 눈속임을 없애고 실제 잔여 비율(1.0)을 보여준다.
// 4) 쿼터 길이 입력이 10px 회색 텍스트라 편집 가능한지 알 수 없었다 → 라벨 + 밑줄 강조.
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Vibration, View, useWindowDimensions } from 'react-native';
import { Text, TextInput } from '../../../components/nativeText';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { ParticleSphere } from '../../assignment/components/ParticleSphere';
import { colors } from '../../../theme';

const STROKE_WIDTH = 6;
const PARTICLE_OVERFLOW = 60;

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
}: Props) {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const ringSize = Math.min(240, SCREEN_WIDTH * 0.64);
  const radius = (ringSize - STROKE_WIDTH) / 2;
  const circumference = 2 * Math.PI * radius;

  const [quarterMinutes, setQuarterMinutes] = useState(initialQuarterMinutes);
  const [remainingSeconds, setRemainingSeconds] = useState(quarterMinutes * 60);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const player = useAudioPlayer(require('../../../../assets/sounds/whistle.mp3'));

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  const playWhistle = (times: number) => {
    for (let i = 0; i < times; i++) {
      setTimeout(() => {
        player.seekTo(0);
        player.play();
      }, i * 800);
    }
  };

  useEffect(() => {
    if (!isRunning) return;
    intervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          Vibration.vibrate(500);
          playWhistle(3);
          setIsRunning(false);
          onQuarterEnd();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  // 쿼터가 바뀌면(다음 쿼터로 넘어가면) 새 쿼터 길이로 리셋
  useEffect(() => {
    setIsRunning(false);
    setRemainingSeconds(quarterMinutes * 60);
  }, [quarter]);

  const handleStartPause = () => {
    if (!isRunning) playWhistle(1);
    setIsRunning((r) => !r);
  };

  const handleReset = () => {
    setIsRunning(false);
    setRemainingSeconds(quarterMinutes * 60);
  };

  const handleMinutesChange = (text: string) => {
    const value = Number(text) || 0;
    setQuarterMinutes(value);
    if (!isRunning) setRemainingSeconds(value * 60);
  };

  const handleAddMinute = () => {
    setRemainingSeconds((prev) => prev + 60);
  };

  const totalSeconds = quarterMinutes * 60;
  const isFresh = remainingSeconds === totalSeconds;
  const stateLabel =
    remainingSeconds === 0 ? '쿼터 종료' : isRunning ? '진행 중' : isFresh ? '경기 전' : '일시정지';
  const progress = totalSeconds > 0 ? Math.min(1, remainingSeconds / totalSeconds) : 0;
  const strokeDashoffset = circumference * (1 - progress);

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

      <View style={[styles.ringSection, { width: ringSize, height: ringSize }]}>
        <View style={[styles.particleLayer, { width: ringSize, height: ringSize }]} pointerEvents="none">
          <View style={{ transform: [{ scaleX: (ringSize + PARTICLE_OVERFLOW) / ringSize }] }}>
            <ParticleSphere size={ringSize} />
          </View>
        </View>

        <Svg width={ringSize} height={ringSize}>
          <Circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            stroke="#173A28"
            strokeOpacity={0.9}
            strokeWidth={STROKE_WIDTH}
            fill="none"
          />
          <Circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            stroke="#50D978"
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
          {isAdmin ? (
            <View style={styles.quarterEditRow}>
              <TextInput
                style={[styles.quarterInput, isRunning && styles.quarterInputLocked]}
                value={String(quarterMinutes)}
                onChangeText={(text) => handleMinutesChange(text.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                editable={!isRunning}
                maxLength={3}
              />
              <Text style={styles.quarterUnit}>분</Text>
            </View>
          ) : (
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

          <Pressable
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            onPress={handleAddMinute}
          >
            <Ionicons name="add" size={15} color={colors.textMuted} />
            <Text style={styles.secondaryButtonText}>1분</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.scoreRow}>
        <Text style={styles.scoreText}>
          A팀 {scoreA} : {scoreB} B팀
        </Text>
        <Pressable onPress={onPressScore} hitSlop={8}>
          <Text style={styles.scoreLink}>스코어 기록 →</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center' },
  pressed: { opacity: 0.85 },

  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  quarterChip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: '#1B2A22' },
  quarterText: { color: colors.green, fontSize: 11, fontWeight: '800' },
  headSub: { color: colors.textDim, fontSize: 11.5, fontWeight: '600' },

  ringSection: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  particleLayer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
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
    color: '#FFFFFF',
    fontSize: 44,
    lineHeight: 50,
    fontWeight: '800',
    letterSpacing: -1.5,
    fontVariant: ['tabular-nums'],
  },
  quarterEditRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2, marginTop: 2 },
  quarterInput: {
    minWidth: 24,
    color: colors.green,
    fontSize: 12.5,
    fontWeight: '700',
    textAlign: 'center',
    padding: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.greenDeep,
    fontVariant: ['tabular-nums'],
  },
  quarterInputLocked: { color: colors.textDim, borderBottomColor: 'transparent' },
  quarterUnit: { color: colors.textMuted, fontSize: 11.5, fontWeight: '600' },
  quarterStatic: { marginTop: 3, color: colors.textMuted, fontSize: 11.5, fontWeight: '600' },

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
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: '#26332D',
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
    borderColor: '#6B5426',
  },
  primaryButtonText: { color: colors.bgRoot, fontSize: 14.5, fontWeight: '800' },
  primaryButtonTextPause: { color: colors.gold },

  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  scoreText: { color: colors.textDim, fontSize: 11.5, fontWeight: '600' },
  scoreLink: { color: colors.green, fontSize: 11.5, fontWeight: '700' },
});
