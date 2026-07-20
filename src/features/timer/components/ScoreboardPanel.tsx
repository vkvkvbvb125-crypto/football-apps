import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function ScoreboardPanel() {
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);

  const handleReset = () => {
    setScoreA(0);
    setScoreB(0);
  };

  return (
    <View style={styles.content}>
      <View style={styles.scoreRow}>
        <View style={styles.teamColumn}>
          <Text style={styles.teamLabel}>A팀</Text>
          <Text style={styles.scoreText}>{scoreA}</Text>
          <View style={styles.scoreButtonRow}>
            <Pressable
              style={({ pressed }) => [styles.scoreButton, pressed && styles.pressedOpacity]}
              onPress={() => setScoreA((s) => Math.max(0, s - 1))}
            >
              <Text style={styles.scoreButtonText}>-1</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.scoreButton, styles.scoreButtonPrimary, pressed && styles.pressedOpacity]}
              onPress={() => setScoreA((s) => s + 1)}
            >
              <Text style={styles.scoreButtonTextPrimary}>+1</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.vsText}>VS</Text>

        <View style={styles.teamColumn}>
          <Text style={styles.teamLabel}>B팀</Text>
          <Text style={styles.scoreText}>{scoreB}</Text>
          <View style={styles.scoreButtonRow}>
            <Pressable
              style={({ pressed }) => [styles.scoreButton, pressed && styles.pressedOpacity]}
              onPress={() => setScoreB((s) => Math.max(0, s - 1))}
            >
              <Text style={styles.scoreButtonText}>-1</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.scoreButton, styles.scoreButtonPrimary, pressed && styles.pressedOpacity]}
              onPress={() => setScoreB((s) => s + 1)}
            >
              <Text style={styles.scoreButtonTextPrimary}>+1</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.resetButton, pressed && styles.pressedOpacity]}
        onPress={handleReset}
      >
        <Text style={styles.resetButtonText}>초기화</Text>
      </Pressable>
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
  pressedOpacity: {
    opacity: 0.7,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    width: '100%',
    justifyContent: 'center',
  },
  teamColumn: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#141A17',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#22302A',
    paddingVertical: 20,
  },
  teamLabel: {
    color: '#39D98A',
    fontWeight: '700',
    fontSize: 14,
  },
  scoreText: {
    marginTop: 8,
    color: '#FFFFFF',
    fontSize: 48,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  scoreButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  scoreButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1B231F',
    borderWidth: 1,
    borderColor: '#22302A',
  },
  scoreButtonPrimary: {
    backgroundColor: '#39D98A',
    borderColor: '#39D98A',
  },
  scoreButtonText: {
    color: '#8A9490',
    fontWeight: '700',
    fontSize: 14,
  },
  scoreButtonTextPrimary: {
    color: '#0B0F0D',
    fontWeight: '700',
    fontSize: 14,
  },
  vsText: {
    color: '#5A625E',
    fontWeight: '700',
    fontSize: 13,
  },
  resetButton: {
    marginTop: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#141A17',
    borderWidth: 1,
    borderColor: '#22302A',
  },
  resetButtonText: {
    color: '#8A9490',
    fontWeight: '600',
    fontSize: 13,
  },
});
