import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, Vibration, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { ParticleSphere } from '../../assignment/components/ParticleSphere';

const STROKE_WIDTH = 6;
const PARTICLE_BOX = 300;

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
  const ringSize = Math.min(250, SCREEN_WIDTH * 0.66);
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
  const progress = totalSeconds > 0 ? Math.min(1, remainingSeconds / totalSeconds) : 0;
  const strokeDashoffset = circumference * (1 - progress);
  const stateLabel =
    remainingSeconds === 0 ? '종료' : isRunning ? '진행중' : remainingSeconds === totalSeconds ? '경기 전' : '일시정지';

  return (
    <View style={styles.content}>
      <View style={styles.ringSection}>
        <View style={styles.particleLayer} pointerEvents="none">
          <ParticleSphere size={PARTICLE_BOX} />
        </View>

        <View style={{ width: ringSize, height: ringSize, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={ringSize} height={ringSize}>
            <Circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              stroke="#1D472F"
              strokeWidth={STROKE_WIDTH}
              fill="none"
            />
            <Circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              stroke="#52D979"
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={strokeDashoffset}
              fill="none"
              rotation={-90}
              originX={ringSize / 2}
              originY={ringSize / 2}
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
      </View>

      <View style={styles.controlRow}>
        <Pressable style={styles.secondaryButton} onPress={handleReset}>
          <Ionicons name="refresh-outline" size={14} color="#8A9490" />
          <Text style={styles.secondaryButtonText}>초기화</Text>
        </Pressable>
        <Pressable style={styles.primaryButton} onPress={handleStartPause}>
          <Text style={styles.primaryButtonText}>{isRunning ? '일시정지' : '시작'}</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={handleAddMinute}>
          <Ionicons name="add" size={14} color="#8A9490" />
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
    width: PARTICLE_BOX,
    height: PARTICLE_BOX,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  particleLayer: {
    position: 'absolute',
    width: PARTICLE_BOX,
    height: PARTICLE_BOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateLabel: {
    color: '#8A9490',
    fontSize: 13,
    fontWeight: '600',
  },
  timeDisplay: {
    marginTop: 8,
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  quarterRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quarterInput: {
    color: '#8A9490',
    fontSize: 11,
    textAlign: 'center',
    width: 16,
    padding: 0,
  },
  quarterUnit: {
    color: '#8A9490',
    fontSize: 11,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 16,
  },
  secondaryButton: {
    width: 74,
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 16,
    backgroundColor: '#141A17',
    borderWidth: 1,
    borderColor: '#22302A',
  },
  secondaryButtonText: {
    color: '#8A9490',
    fontWeight: '600',
    fontSize: 12,
  },
  primaryButton: {
    width: 88,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4ADE80',
  },
  primaryButtonText: {
    color: '#0F1512',
    fontWeight: '700',
    fontSize: 14,
  },
});
