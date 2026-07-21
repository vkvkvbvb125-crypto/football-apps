import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
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

  return (
    <View style={styles.content}>
      <Text style={styles.timeDisplay}>{formatTime(remainingSeconds)}</Text>

      <View style={styles.minutesRow}>
        <Text style={styles.minutesLabel}>타이머 시간(분)</Text>
        <TextInput
          style={styles.minutesInput}
          value={String(quarterMinutes)}
          onChangeText={handleMinutesChange}
          keyboardType="number-pad"
          editable={!isRunning}
        />
      </View>

      <View style={styles.controlRow}>
        <Pressable style={styles.controlButton} onPress={handleReset}>
          <Text style={styles.controlButtonText}>초기화</Text>
        </Pressable>
        <Pressable style={styles.primaryButton} onPress={handleStartPause}>
          <Text style={styles.primaryButtonText}>{isRunning ? '일시정지' : '시작'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
    alignItems: 'center',
  },
  timeDisplay: {
    marginTop: 8,
    color: '#FFFFFF',
    fontSize: 64,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  minutesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
  },
  minutesLabel: {
    color: '#8A9490',
    fontSize: 13,
  },
  minutesInput: {
    width: 60,
    borderWidth: 1,
    borderColor: '#22302A',
    borderRadius: 8,
    paddingVertical: 6,
    textAlign: 'center',
    color: '#FFFFFF',
    backgroundColor: '#0F1512',
  },
  controlRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
    width: '100%',
  },
  controlButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#141A17',
    borderWidth: 1,
    borderColor: '#22302A',
  },
  controlButtonText: {
    color: '#8A9490',
    fontWeight: '600',
    fontSize: 13,
  },
  primaryButton: {
    flex: 1.4,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#4ADE80',
  },
  primaryButtonText: {
    color: '#0F1512',
    fontWeight: '700',
    fontSize: 14,
  },
});
