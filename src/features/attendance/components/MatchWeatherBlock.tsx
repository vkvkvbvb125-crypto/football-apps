// src/features/attendance/components/MatchWeatherBlock.tsx
// 일정 상세 카드의 날씨 블록 — D-day에 따라 표시가 달라진다.
//
//   D-3 이내  : 단기예보(3시간 슬롯) → 정확한 온도/강수/습도 + "정확도 높음"
//   D-4 ~ D-10: 중기예보(오전/오후) → "참고용" 배지, 안내 배너 없음
//   D-10 초과 : "아직 예보 정보가 없어요"
//
// 실내구장 안내 배너는 [실외 구장 + D-3 이내 + 비/눈] 일 때만 뜬다.
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { colors } from '../../../theme';
import { weatherEmoji, weatherLabel, type MatchWeather as ServiceWeather } from '../services/weatherService';

export type WeatherLevel = 'clear' | 'cloud' | 'rain' | 'snow';

export interface MatchWeather {
  available: boolean;
  /** 'short' | 'mid' | 'none' — fetchMatchWeather의 range와 맞춤 */
  range: 'short' | 'mid' | 'none';
  level: WeatherLevel;
  emoji: string;
  stateText: string; // "비", "맑음"
  temp: string; // "22°"
  rain: string; // "80%"
  humidity?: string; // "85%"
}

/** weatherService.fetchMatchWeather 결과를 이 컴포넌트가 쓰는 형태로 변환한다. */
export function toMatchWeatherBlockData(raw: ServiceWeather | null): MatchWeather | null {
  if (!raw?.available) return null;

  if (raw.range === 'mid') {
    const am = raw.amWeather ?? '';
    const pm = raw.pmWeather ?? '';
    const level: WeatherLevel =
      am.includes('눈') || pm.includes('눈')
        ? 'snow'
        : am.includes('비') || pm.includes('비')
          ? 'rain'
          : am.includes('맑') || pm.includes('맑')
            ? 'clear'
            : 'cloud';
    const emoji = level === 'snow' ? '❄️' : level === 'rain' ? '🌧️' : level === 'clear' ? '☀️' : '⛅';

    return {
      available: true,
      range: 'mid',
      level,
      emoji,
      stateText: pm || am || '흐림',
      temp: `${raw.minTemp ?? '-'}~${raw.maxTemp ?? '-'}°`,
      rain: `${raw.amPop ?? '-'}~${raw.pmPop ?? '-'}%`,
    };
  }

  const pty = raw.precipitationType ?? '0';
  const sky = raw.sky ?? '1';
  const level: WeatherLevel =
    pty === '3' || pty === '7' ? 'snow' : pty !== '0' ? 'rain' : sky === '1' ? 'clear' : sky === '3' ? 'cloud' : 'cloud';

  return {
    available: true,
    range: 'short',
    level,
    emoji: weatherEmoji(pty, sky),
    stateText: weatherLabel(pty, sky),
    temp: `${raw.temperature ?? '-'}°`,
    rain: `${raw.precipitationChance ?? '-'}%`,
    humidity: raw.humidity ? `${raw.humidity}%` : undefined,
  };
}

export function weatherAccent(level: WeatherLevel) {
  if (level === 'rain' || level === 'snow') return '#60A5FA';
  if (level === 'clear') return '#FACC15';
  return colors.textMuted;
}

export function shouldSuggestIndoor(p: { weather: MatchWeather | null; isOutdoor: boolean; daysUntil: number }) {
  if (!p.weather?.available || p.weather.range !== 'short') return false;
  if (!p.isOutdoor) return false;
  if (p.daysUntil > 3) return false;
  return p.weather.level === 'rain' || p.weather.level === 'snow';
}

interface Props {
  weather: MatchWeather | null;
  daysUntil: number;
  timeLabel: string; // "20:00"
  isOutdoor: boolean;
  isAdmin: boolean;
  /** 'keep' | 'indoor' | null — 총무가 이미 결정했는지 */
  decision?: 'keep' | 'indoor' | null;
  onKeep?: () => void;
  onFindIndoor?: () => void;
}

export function MatchWeatherBlock({
  weather,
  daysUntil,
  timeLabel,
  isOutdoor,
  isAdmin,
  decision,
  onKeep,
  onFindIndoor,
}: Props) {
  if (!weather?.available) {
    return (
      <View style={styles.none}>
        <Text style={styles.noneText}>아직 예보 정보가 없어요 · 경기 10일 전부터 보여드려요</Text>
      </View>
    );
  }

  const short = weather.range === 'short';
  const bad = weather.level === 'rain' || weather.level === 'snow';
  const highlight = short && bad;
  const advise = shouldSuggestIndoor({ weather, isOutdoor, daysUntil });

  return (
    <View style={{ gap: 12 }}>
      <View style={[styles.box, highlight && styles.boxAlert]}>
        <View style={[styles.icon, highlight && styles.iconAlert]}>
          <Text style={styles.emoji}>{weather.emoji}</Text>
        </View>
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <View style={styles.tempRow}>
            <Text style={styles.temp}>{weather.temp}</Text>
            <Text style={[styles.state, { color: weatherAccent(weather.level) }]}>{weather.stateText}</Text>
          </View>
          <Text style={styles.meta}>
            {short
              ? `단기예보 · ${timeLabel} 기준 · 강수 ${weather.rain}${
                  weather.humidity ? ` · 습도 ${weather.humidity}` : ''
                }`
              : `중기예보 · 참고용 · 강수 ${weather.rain}`}
          </Text>
        </View>
        <View style={[styles.note, highlight ? styles.noteAlert : styles.noteMuted]}>
          <Text style={[styles.noteText, highlight && { color: '#60A5FA' }]}>
            {short ? (bad ? '우천 주의' : '정확도 높음') : '참고용'}
          </Text>
        </View>
      </View>

      {advise && (
        <View style={styles.advice}>
          <View style={styles.adviceRow}>
            <Ionicons name="bulb-outline" size={14} color="#9FC2E8" />
            <Text style={styles.adviceText}>
              경기 시각({timeLabel})에 {weather.level === 'snow' ? '눈' : '비'} 확률이 {weather.rain}예요. 실내
              구장으로 옮기거나, 늦어도 하루 전까지 취소 여부를 알려주세요.
            </Text>
          </View>

          {isAdmin && !decision ? (
            <View style={styles.adviceCta}>
              <Pressable onPress={onKeep} style={styles.keep}>
                <Text style={styles.keepText}>그대로 진행</Text>
              </Pressable>
              <Pressable onPress={onFindIndoor} style={styles.indoor}>
                <Text style={styles.indoorText}>실내구장 찾기</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.decided}>
              {decision === 'indoor'
                ? '실내구장으로 변경 예정 · 참석자 전체에게 변경 알림이 갑니다'
                : decision === 'keep'
                  ? '그대로 진행하기로 했어요 · 우천 시 다시 판단해주세요'
                  : '총무가 실내 구장 변경을 검토하고 있어요'}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  none: {
    padding: 13,
    borderRadius: 14,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  noneText: { color: '#5F6B66', fontSize: 11.5, fontWeight: '600' },

  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    borderRadius: 14,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  boxAlert: { backgroundColor: 'rgba(96,165,250,0.07)', borderColor: '#2A3F58' },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  iconAlert: { backgroundColor: 'rgba(96,165,250,0.12)' },
  emoji: { fontSize: 19 },
  tempRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  temp: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  state: { fontSize: 12, fontWeight: '700' },
  meta: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  note: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  noteAlert: { backgroundColor: 'rgba(96,165,250,0.14)' },
  noteMuted: { backgroundColor: 'rgba(255,255,255,0.05)' },
  noteText: { color: colors.textDim, fontSize: 10.5, fontWeight: '800' },

  advice: {
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(96,165,250,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.18)',
  },
  adviceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  adviceText: { flex: 1, color: '#9FC2E8', fontSize: 11.5, fontWeight: '600', lineHeight: 17 },
  adviceCta: { flexDirection: 'row', gap: 8 },
  keep: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: '#26332D',
  },
  keepText: { color: '#C9D3CF', fontSize: 12.5, fontWeight: '800' },
  indoor: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(96,165,250,0.14)',
    borderWidth: 1,
    borderColor: '#2F4560',
  },
  indoorText: { color: '#60A5FA', fontSize: 12.5, fontWeight: '800' },
  decided: { color: '#9FC2E8', fontSize: 11, fontWeight: '800' },
});
