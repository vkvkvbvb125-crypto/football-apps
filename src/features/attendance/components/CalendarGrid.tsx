// src/features/attendance/components/CalendarGrid.tsx
// 캘린더는 경기 유무 점(dot)만 표시한다 — 날씨는 MatchWeatherBlock에서만 다룬다.
//
// ⚠ 수정 요약: 이전 버전은 자체적으로 marginHorizontal 20 + 배경 + 테두리를 갖고 있었는데,
// AttendanceScreen이 이미 styles.calendarCard(같은 마진/배경/테두리)로 감싸고 있어서
// 카드가 이중으로 겹치고 좌우 마진이 40px씩 먹혔다. 그 결과 셀 폭이 44px 원보다 좁아져
// 날짜 원이 잘렸다. 카드 껍데기는 부모가 갖고, 이 컴포넌트는 내용만 그린다.
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

interface CalendarGridProps {
  year: number;
  month: number; // 0-indexed
  selectedDate: Date | null;
  markedDates: Set<string>; // 'YYYY-M-D' keys that have a match
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
  // 마지막 주가 빈 줄이면 굳이 그리지 않는다 (6주 고정 → 필요한 주만)
  while (cells.length % 7 !== 0) cells.push(null);

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

            return (
              <Pressable key={di} style={styles.cell} onPress={() => onSelectDate(date)}>
                <View
                  style={[
                    styles.dayCircle,
                    isToday && !isSelected && styles.dayCircleToday,
                    isSelected && styles.dayCircleSelected,
                  ]}
                >
                  {/* 주말 색은 요일 머리글에만 준다 — 날짜 숫자까지 빨강/파랑이면
                      오늘·선택 표시(초록)와 색이 맞붙어 무엇이 강조인지 흐려진다 */}
                  <Text
                    style={[
                      styles.dayText,
                      isToday && styles.dayTextToday,
                      isSelected && styles.dayTextSelected,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                </View>
                <View style={[styles.dot, !hasMatch && styles.dotHidden]} />
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={styles.legendDot} />
          <Text style={styles.legendText}>경기 예정 · 날짜를 탭하면 아래에 상세가 보여요</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // 카드(배경/테두리/좌우 마진)는 AttendanceScreen의 calendarCard가 갖는다
  container: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  weekdayRow: { flexDirection: 'row' },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    color: '#5A625E',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  weekdayTextSunday: { color: '#C86D6D' },
  weekdayTextSaturday: { color: '#7093C8' },

  weekRow: { flexDirection: 'row' },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 5,
  },
  dayCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleToday: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: '#26332D',
  },
  dayCircleSelected: {
    backgroundColor: 'rgba(74,222,128,0.16)',
    borderWidth: 1,
    borderColor: '#4ADE80',
  },
  dayText: { color: '#C9D3CF', fontSize: 13.5, fontWeight: '600', fontVariant: ['tabular-nums'] },
  dayTextToday: { color: '#FFFFFF', fontWeight: '800' },
  dayTextSelected: { color: '#4ADE80', fontWeight: '800' },

  dot: {
    marginTop: 3,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#4ADE80',
  },
  // 자리를 유지해서 점 유무로 행 높이가 흔들리지 않게 한다
  dotHidden: { backgroundColor: 'transparent' },

  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1B2521',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ADE80' },
  legendText: { color: '#6F7B76', fontSize: 10.5, fontWeight: '600' },
});
