import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

interface CalendarGridProps {
  year: number;
  month: number; // 0-indexed
  selectedDate: Date | null;
  markedDates: Set<string>; // 'YYYY-MM-DD' keys that have a match
  weatherByDate?: Record<string, string>; // dateKey -> 날씨 이모지 (예보 있는 날짜만)
  onSelectDate: (date: Date) => void;
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function weatherTint(emoji: string): string | null {
  if (emoji === '🌧️' || emoji === '🌨️') return 'rgba(59,130,246,0.35)';
  if (emoji === '❄️') return 'rgba(147,197,253,0.35)';
  if (emoji === '☀️') return 'rgba(250,204,21,0.28)';
  if (emoji === '⛅' || emoji === '☁️') return 'rgba(148,163,184,0.28)';
  return null;
}

function WeatherEffect({ emoji }: { emoji: string }) {
  if (emoji === '🌧️' || emoji === '🌨️') {
    return <FallingParticles color="rgba(191,219,254,0.9)" size={2} duration={450} stagger={120} />;
  }
  if (emoji === '❄️') {
    return <FallingParticles color="rgba(255,255,255,0.85)" size={4} duration={900} stagger={220} />;
  }
  if (emoji === '☀️') return <SunGlow />;
  if (emoji === '⛅' || emoji === '☁️') return <CloudDrift />;
  return null;
}

function FallingParticles({
  color,
  size,
  duration,
  stagger,
  count = 3,
}: {
  color: string;
  size: number;
  duration: number;
  stagger: number;
  count?: number;
}) {
  const anims = useRef(Array.from({ length: count }, () => new Animated.Value(0))).current;

  useEffect(() => {
    const loops = anims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * stagger),
          Animated.timing(anim, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [anims, duration, stagger]);

  return (
    <View style={styles.effectContainer} pointerEvents="none">
      {anims.map((anim, i) => {
        const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-6, 46] });
        const opacity = anim.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 1, 1, 0] });
        return (
          <Animated.View
            key={i}
            style={[
              styles.particle,
              {
                left: 8 + i * 11,
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: color,
                opacity,
                transform: [{ translateY }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

function SunGlow() {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] });
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.5] });

  return (
    <View style={styles.effectContainer} pointerEvents="none">
      <Animated.View style={[styles.sunGlow, { opacity, transform: [{ scale }] }]} />
    </View>
  );
}

function CloudDrift() {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [-6, 6] });

  return (
    <View style={styles.effectContainer} pointerEvents="none">
      <Animated.View style={[styles.cloud, { transform: [{ translateX }] }]} />
    </View>
  );
}

export function CalendarGrid({ year, month, selectedDate, markedDates, weatherByDate, onSelectDate }: CalendarGridProps) {
  const firstDayOfMonth = new Date(year, month, 1);
  const startWeekday = firstDayOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const today = new Date();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length < 42) cells.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <View style={styles.container}>
      <View style={styles.weekdayRow}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={styles.weekdayText}>
            {w}
          </Text>
        ))}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((date, di) => {
            if (!date) return <View key={di} style={styles.cell} />;

            const isSelected = selectedDate && dateKey(date) === dateKey(selectedDate);
            const isToday = dateKey(date) === dateKey(today);
            const hasMatch = markedDates.has(dateKey(date));
            const weatherEmoji = weatherByDate?.[dateKey(date)];
            const tint = weatherEmoji ? weatherTint(weatherEmoji) : null;

            return (
              <Pressable key={di} style={styles.cell} onPress={() => onSelectDate(date)}>
                <View
                  style={[styles.dayCircle, tint ? { backgroundColor: tint } : null, isSelected && styles.dayCircleSelected]}
                >
                  {tint && !isSelected && weatherEmoji && <WeatherEffect emoji={weatherEmoji} />}
                  <Text
                    style={[
                      styles.dayText,
                      isToday && !isSelected && styles.dayTextToday,
                      isSelected && styles.dayTextSelected,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                </View>
                {hasMatch && !tint && <View style={[styles.dot, isSelected && styles.dotSelected]} />}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    color: '#5A625E',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  weekRow: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  dayCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  effectContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  particle: {
    position: 'absolute',
    top: 0,
  },
  sunGlow: {
    position: 'absolute',
    top: 5,
    left: 5,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FACC15',
  },
  cloud: {
    position: 'absolute',
    top: 14,
    left: 9,
    width: 26,
    height: 14,
    borderRadius: 8,
    backgroundColor: 'rgba(203,213,225,0.55)',
  },
  dayCircleSelected: {
    backgroundColor: '#39D98A',
  },
  dayText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  dayTextToday: {
    color: '#39D98A',
    fontWeight: '700',
  },
  dayTextSelected: {
    color: '#0B0F0D',
    fontWeight: '700',
  },
  dot: {
    marginTop: 4,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#39D98A',
  },
  dotSelected: {
    backgroundColor: '#39D98A',
  },
});
