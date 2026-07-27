// src/features/attendance/components/CalendarGrid.tsx
// 캘린더는 경기 유무 점(dot)만 표시한다 — 날씨는 MatchWeatherBlock에서만 다룬다
// (예전엔 날짜 칸에 날씨 이모지 틴트 + 애니메이션을 넣었었는데, 리디자인에서 캘린더와
// 날씨 표시를 분리하기로 하면서 뺐다).
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

interface CalendarGridProps {
  year: number;
  month: number; // 0-indexed
  selectedDate: Date | null;
  markedDates: Set<string>; // 'YYYY-MM-DD' keys that have a match
  onSelectDate: (date: Date) => void;
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function CalendarGrid({ year, month, selectedDate, markedDates, onSelectDate }: CalendarGridProps) {
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
        {WEEKDAYS.map((w, i) => (
          <Text
            key={w}
            style={[styles.weekdayText, i === 0 && styles.weekdayTextSunday, i === 6 && styles.weekdayTextSaturday]}
          >
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
            const weekday = date.getDay();

            return (
              <Pressable key={di} style={styles.cell} onPress={() => onSelectDate(date)}>
                <View style={[styles.dayCircle, isSelected && styles.dayCircleSelected]}>
                  <Text
                    style={[
                      styles.dayText,
                      weekday === 0 && styles.dayTextSunday,
                      weekday === 6 && styles.dayTextSaturday,
                      isToday && styles.dayTextToday,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                </View>
                {hasMatch && <View style={styles.dot} />}
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#4ADE80' }]} />
          <Text style={styles.legendText}>경기 예정</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 20,
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 16,
    backgroundColor: '#141A17',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#22302A',
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
  weekdayTextSunday: {
    color: '#F87171',
  },
  weekdayTextSaturday: {
    color: '#60A5FA',
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
    borderWidth: 2,
    borderColor: '#4ADE80',
  },
  dayText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  dayTextSunday: {
    color: '#F87171',
  },
  dayTextSaturday: {
    color: '#60A5FA',
  },
  dayTextToday: {
    color: '#4ADE80',
    fontWeight: '700',
  },
  dot: {
    marginTop: 4,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#4ADE80',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 14,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#22302A',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: '#8A9490',
    fontSize: 11,
  },
});
