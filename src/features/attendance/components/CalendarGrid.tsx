import { Pressable, StyleSheet, Text, View } from 'react-native';

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

            return (
              <Pressable key={di} style={styles.cell} onPress={() => onSelectDate(date)}>
                <View style={[styles.dayCircle, isSelected && styles.dayCircleSelected]}>
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
                {weatherEmoji ? (
                  <Text style={styles.weatherEmoji}>{weatherEmoji}</Text>
                ) : (
                  hasMatch && <View style={[styles.dot, isSelected && styles.dotSelected]} />
                )}
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
  weatherEmoji: {
    marginTop: 2,
    fontSize: 12,
  },
  dotSelected: {
    backgroundColor: '#39D98A',
  },
});
