import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fetchMatchWeather, weatherEmoji, weatherLabel, type MatchWeather } from '../services/weatherService';

interface WeatherBadgeProps {
  latitude: number | null;
  longitude: number | null;
  matchDateIso: string;
}

export function WeatherBadge({ latitude, longitude, matchDateIso }: WeatherBadgeProps) {
  const [weather, setWeather] = useState<MatchWeather | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    setWeather(null);
    setUnavailable(false);

    if (latitude == null || longitude == null) {
      setUnavailable(true);
      return;
    }
    const hoursUntilMatch = (new Date(matchDateIso).getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntilMatch > 240 || hoursUntilMatch < -3) {
      setUnavailable(true);
      return;
    }

    let cancelled = false;
    fetchMatchWeather(latitude, longitude, matchDateIso)
      .then((result) => {
        if (cancelled) return;
        if (result.available) setWeather(result);
        else setUnavailable(true);
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      });
    return () => {
      cancelled = true;
    };
  }, [latitude, longitude, matchDateIso]);

  if (unavailable) {
    return (
      <View style={styles.unavailableCard}>
        <Text style={styles.unavailableText}>날씨 조회가 안 되는 날짜예요</Text>
      </View>
    );
  }

  if (!weather || !weather.available) return null;

  if (weather.range === 'mid') {
    const amRain = weather.amWeather?.includes('비') || weather.amWeather?.includes('눈');
    const pmRain = weather.pmWeather?.includes('비') || weather.pmWeather?.includes('눈');
    const showIndoorHint =
      amRain || pmRain || Number(weather.amPop ?? '0') >= 60 || Number(weather.pmPop ?? '0') >= 60;

    return (
      <View>
        <View style={styles.card}>
          <Text style={styles.emoji}>{amRain || pmRain ? '🌧️' : '⛅'}</Text>
          <View style={styles.textCol}>
            <Text style={styles.condition}>
              오전 {weather.amWeather} · 오후 {weather.pmWeather}
            </Text>
            <Text style={styles.temp}>
              {weather.minTemp}~{weather.maxTemp}°C · 강수 {weather.amPop}~{weather.pmPop}%
            </Text>
          </View>
        </View>
        {showIndoorHint && <Text style={styles.hint}>☔ 비 예보 - 실내 대체 장소도 고려해보세요</Text>}
      </View>
    );
  }

  const pty = weather.precipitationType ?? '0';
  const sky = weather.sky ?? '1';
  const pop = Number(weather.precipitationChance ?? '0');
  const showIndoorHint = pty !== '0' || pop >= 60;

  return (
    <View>
      <View style={styles.card}>
        <Text style={styles.emoji}>{weatherEmoji(pty, sky)}</Text>
        <View style={styles.textCol}>
          <Text style={styles.condition}>{weatherLabel(pty, sky)}</Text>
          <Text style={styles.temp}>
            {weather.temperature}°C · 강수 {weather.precipitationChance}%
          </Text>
        </View>
      </View>
      {showIndoorHint && <Text style={styles.hint}>☔ 비 예보 - 실내 대체 장소도 고려해보세요</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#0F1512',
    borderWidth: 1,
    borderColor: '#22302A',
  },
  emoji: {
    fontSize: 26,
  },
  textCol: {
    gap: 1,
  },
  condition: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  temp: {
    color: '#8A9490',
    fontSize: 12,
    fontWeight: '600',
  },
  hint: {
    marginTop: 4,
    color: '#F0B429',
    fontSize: 11,
    fontWeight: '600',
  },
  unavailableCard: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#0F1512',
    borderWidth: 1,
    borderColor: '#22302A',
  },
  unavailableText: {
    color: '#8A9490',
    fontSize: 12,
    fontWeight: '600',
  },
});
