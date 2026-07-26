import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Vibration, View, useWindowDimensions } from 'react-native';
import { Text, TextInput } from '../../../components/nativeText';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { ParticleSphere } from '../../assignment/components/ParticleSphere';

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

export function TimerPanel() {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const ringSize = Math.min(240, SCREEN_WIDTH * 0.64);
  const radius = (ringSize - STROKE_WIDTH) / 2;
  const circumference = 2 * Math.PI * radius;

  const [quarterMinutes, setQuarterMinutes] = useState(10);
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
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning]);

  const handleStartPause = () => {
    if (!isRunning) {
      playWhistle(1);
    }
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
    remainingSeconds === 0 ? '종료' : isRunning ? '진행중' : remainingSeconds === totalSeconds ? '경기 전' : '일시정지';
  // ponytail: 대기 상태(경기 전)는 목표 목업처럼 절반 정도만 밝게 고정 표시.
  // 실행/일시정지/종료 시에는 실제 남은 시간 비율을 그대로 반영.
  const progress =
    stateLabel === '경기 전' ? 0.475 : totalSeconds > 0 ? Math.min(1, remainingSeconds / totalSeconds) : 0;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <View style={styles.content}>
      <View style={[styles.ringSection, { width: ringSize, height: ringSize }]}>
        <View
          style={[styles.particleLayer, { width: ringSize, height: ringSize }]}
          pointerEvents="none"
        >
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
        <View style={styles.ringCenter}>
          <Text style={styles.stateLabel}>{stateLabel}</Text>
          <Text style={styles.timeDisplay}>{formatTime(remainingSeconds)}</Text>
          <TextInput
            style={styles.quarterInput}
            value={`${quarterMinutes}분`}
            onChangeText={(text) => handleMinutesChange(text.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            editable={!isRunning}
          />
        </View>
      </View>

      <View style={styles.controlRow}>
        <Pressable
          style={[styles.secondaryButton, { width: SCREEN_WIDTH * 0.23 }]}
          onPress={handleReset}
        >
          <Ionicons name="refresh-outline" size={13} color="#8A9490" />
          <Text style={styles.secondaryButtonText}>초기화</Text>
        </Pressable>
        <Pressable
          style={[styles.primaryButton, { width: SCREEN_WIDTH * 0.28 }]}
          onPress={handleStartPause}
        >
          <Text style={styles.primaryButtonText}>{isRunning ? '일시정지' : '시작'}</Text>
        </Pressable>
        <Pressable
          style={[styles.secondaryButton, { width: SCREEN_WIDTH * 0.23 }]}
          onPress={handleAddMinute}
        >
          <Ionicons name="add" size={13} color="#8A9490" />
          <Text style={styles.secondaryButtonText}>1분</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
  },
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
});
