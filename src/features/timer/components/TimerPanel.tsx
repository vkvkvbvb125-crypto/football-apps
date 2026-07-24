import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';

const RING_SIZE = 232;
const STROKE_WIDTH = 10;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

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
  const progress = totalSeconds > 0 ? Math.min(1, remainingSeconds / totalSeconds) : 0;
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);
  const stateLabel =
    remainingSeconds === 0 ? '종료' : isRunning ? '진행중' : remainingSeconds === totalSeconds ? '경기 전' : '일시정지';

  return (
    <View style={styles.content}>
      <View style={styles.ringWrap}>
        <Svg width={RING_SIZE} height={RING_SIZE}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            stroke="rgba(74,222,128,0.15)"
            strokeWidth={STROKE_WIDTH}
            fill="none"
          />
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            stroke="#4ADE80"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            strokeDashoffset={strokeDashoffset}
            fill="none"
            rotation={-90}
            originX={RING_SIZE / 2}
            originY={RING_SIZE / 2}
          />
        </Svg>
        <View style={styles.ringCenter}>
          <Text style={styles.stateLabel}>{stateLabel}</Text>
          <Text style={styles.timeDisplay}>{formatTime(remainingSeconds)}</Text>
          <View style={styles.quarterRow}>
            <TextInput
              style={styles.quarterInput}
              value={String(quarterMinutes)}
              onChangeText={handleMinutesChange}
              keyboardType="number-pad"
              editable={!isRunning}
            />
            <Text style={styles.quarterUnit}>분</Text>
          </View>
        </View>
      </View>

      <View style={styles.controlRow}>
        <Pressable style={styles.secondaryButton} onPress={handleReset}>
          <Ionicons name="refresh-outline" size={16} color="#8A9490" />
          <Text style={styles.secondaryButtonText}>초기화</Text>
        </Pressable>
        <Pressable style={styles.primaryButton} onPress={handleStartPause}>
          <Text style={styles.primaryButtonText}>{isRunning ? '일시정지' : '시작'}</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={handleAddMinute}>
          <Ionicons name="add" size={16} color="#8A9490" />
          <Text style={styles.secondaryButtonText}>1분</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    alignItems: 'center',
  },
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  stateLabel: {
    color: '#8A9490',
    fontSize: 13,
    fontWeight: '600',
  },
  timeDisplay: {
    marginTop: 8,
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  quarterRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  quarterInput: {
    color: '#8A9490',
    fontSize: 13,
    textAlign: 'right',
    minWidth: 14,
    padding: 0,
  },
  quarterUnit: {
    color: '#8A9490',
    fontSize: 13,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 28,
    width: '100%',
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: '#141A17',
    borderWidth: 1,
    borderColor: '#22302A',
  },
  secondaryButtonText: {
    color: '#8A9490',
    fontWeight: '600',
    fontSize: 13,
  },
  primaryButton: {
    flex: 1.5,
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
    backgroundColor: '#4ADE80',
  },
  primaryButtonText: {
    color: '#0F1512',
    fontWeight: '700',
    fontSize: 15,
  },
});
