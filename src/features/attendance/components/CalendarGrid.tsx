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

function isPrecipitation(emoji: string): boolean {
  return emoji === '🌧️' || emoji === '🌨️' || emoji === '❄️';
}

function RainDrops() {
  const anims = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const loops = anims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 260),
          Animated.timing(anim, {
            toValue: 1,
            duration: 900,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [anims]);

  return (
    <View style={styles.rainContainer} pointerEvents="none">
      {anims.map((anim, i) => {
        const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-6, 46] });
        const opacity = anim.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 1, 1, 0] });
        return (
          <Animated.View
            key={i}
            style={[styles.raindrop, { left: 10 + i * 10, opacity, transform: [{ translateY }] }]}
          />
        );
      })}
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
                  {tint && !isSelected && weatherEmoji && isPrecipitation(weatherEmoji) && <RainDrops />}
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
  rainContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  raindrop: {
    position: 'absolute',
    top: 0,
    width: 2,
    height: 10,
    borderRadius: 1,
    backgroundColor: 'rgba(191,219,254,0.9)',
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
