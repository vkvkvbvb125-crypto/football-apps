// src/features/timer/components/TimerPanel.tsx
// 링 타이머 + 호루라기 사운드(기존 기능)에 쿼터 진행/스코어 요약 연동을 더한 버전.
// 총무만 조작 가능 — 팀원은 보기만 한다(공용 타이머라 여러 명이 동시에 만지면 꼬인다).
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Vibration, View, useWindowDimensions } from 'react-native';
import { Text, TextInput } from '../../../components/nativeText';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { ParticleSphere } from '../../assignment/components/ParticleSphere';
import { colors } from '../../../theme';

const STROKE_WIDTH = 5;
const PARTICLE_OVERFLOW = 60;

function formatTime(totalSeconds: number) {
  const clamped = Math.max(0, totalSeconds);
  const h = Math.floor(clamped / 3600)
    .toString()
    .padStart(2, '0');
  const m = Math.floor((clamped % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const s = Math.floor(clamped % 60)
    .toString()
    .padStart(2, '0');
  return `${h}:${m}:${s}`;
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
  const stateLabel =
    remainingSeconds === 0 ? '쿼터 종료' : isRunning ? '진행중' : remainingSeconds === totalSeconds ? '경기 전' : '일시정지';
  // ponytail: 대기 상태(경기 전)는 목표 목업처럼 절반 정도만 밝게 고정 표시.
  // 실행/일시정지/종료 시에는 실제 남은 시간 비율을 그대로 반영.
  const progress =
    stateLabel === '경기 전' ? 0.475 : totalSeconds > 0 ? Math.min(1, remainingSeconds / totalSeconds) : 0;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <View style={styles.content}>
      <View style={styles.head}>
        <View style={styles.quarterChip}>
          <Text style={styles.quarterText}>{quarter}쿼터</Text>
        </View>
        <Text style={styles.headSub}>
          {totalQuarters}쿼터 중 {quarter}번째
        </Text>
      </View>

      <View style={[styles.ringSection, { width: ringSize, height: ringSize }]}>
        <View style={[styles.particleLayer, { width: ringSize, height: ringSize }]} pointerEvents="none">
          <View style={{ transform: [{ scaleX: (ringSize + PARTICLE_OVERFLOW) / ringSize }] }}>
            <ParticleSphere size={ringSize} />
          </View>
        </View>

        <Svg width={ringSize} height={ringSize}>
          <Circle cx={ringSize / 2} cy={ringSize / 2} r={radius} stroke="#173A28" strokeOpacity={0.9} strokeWidth={STROKE_WIDTH} fill="none" />
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
        <View style={styles.ringCenter}>
          <Text style={styles.stateLabel}>{stateLabel}</Text>
          <Text style={styles.timeDisplay}>{formatTime(remainingSeconds)}</Text>
          {isAdmin ? (
            <TextInput
              style={styles.quarterInput}
              value={`${quarterMinutes}분`}
              onChangeText={(text) => handleMinutesChange(text.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              editable={!isRunning}
            />
          ) : (
            <Text style={styles.quarterInput}>{quarterMinutes}분</Text>
          )}
        </View>
      </View>

      {isAdmin && (
        <View style={styles.controlRow}>
          <Pressable style={[styles.secondaryButton, { width: SCREEN_WIDTH * 0.23 }]} onPress={handleReset}>
            <Ionicons name="refresh-outline" size={13} color="#8A9490" />
            <Text style={styles.secondaryButtonText}>초기화</Text>
          </Pressable>
          <Pressable style={[styles.primaryButton, { width: SCREEN_WIDTH * 0.28 }]} onPress={handleStartPause}>
            <Text style={styles.primaryButtonText}>{isRunning ? '일시정지' : '시작'}</Text>
          </Pressable>
          <Pressable style={[styles.secondaryButton, { width: SCREEN_WIDTH * 0.23 }]} onPress={handleAddMinute}>
            <Ionicons name="add" size={13} color="#8A9490" />
            <Text style={styles.secondaryButtonText}>1분</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.scoreRow}>
        <Text style={styles.scoreText}>
          A팀 {scoreA} : {scoreB} B팀
        </Text>
        <Pressable onPress={onPressScore} hitSlop={6}>
          <Text style={styles.scoreLink}>스코어 기록 →</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
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
  stateLabel: {
    color: '#8A9490',
    fontSize: 12,
    fontWeight: '600',
  },
  timeDisplay: {
    marginTop: 6,
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  quarterInput: {
    marginTop: 3,
    color: '#8A9490',
    fontSize: 10,
    textAlign: 'center',
    padding: 0,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 13,
  },
  secondaryButton: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 15,
    backgroundColor: '#141A17',
    borderWidth: 1,
    borderColor: '#22302A',
  },
  secondaryButtonText: {
    color: '#8A9490',
    fontWeight: '600',
    fontSize: 11,
  },
  primaryButton: {
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#50D978',
  },
  primaryButtonText: {
    color: '#0F1512',
    fontWeight: '700',
    fontSize: 13,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#22302A',
  },
  scoreText: { color: colors.textDim, fontSize: 11.5, fontWeight: '600' },
  scoreLink: { color: colors.green, fontSize: 11.5, fontWeight: '700' },
});
