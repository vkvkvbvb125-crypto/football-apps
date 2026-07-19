import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fetchMatchWeather, weatherEmoji, type MatchWeather } from '../services/weatherService';

interface WeatherBadgeProps {
  latitude: number | null;
  longitude: number | null;
  matchDateIso: string;
}

export function WeatherBadge({ latitude, longitude, matchDateIso }: WeatherBadgeProps) {
  const [weather, setWeather] = useState<MatchWeather | null>(null);

  useEffect(() => {
    if (latitude == null || longitude == null) return;
    const hoursUntilMatch = (new Date(matchDateIso).getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntilMatch > 72 || hoursUntilMatch < -3) return;

    let cancelled = false;
    fetchMatchWeather(latitude, longitude, matchDateIso)
      .then((result) => {
        if (!cancelled) setWeather(result);
      })
      .catch(() => {
        // 날씨 조회 실패는 조용히 무시 (카드에 그냥 안 보이면 됨)
      });
    return () => {
      cancelled = true;
    };
  }, [latitude, longitude, matchDateIso]);

  if (!weather || !weather.available) return null;

  const pty = weather.precipitationType ?? '0';
  const pop = Number(weather.precipitationChance ?? '0');
  const showIndoorHint = pty !== '0' || pop >= 60;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.emoji}>{weatherEmoji(pty, weather.sky ?? '1')}</Text>
        <Text style={styles.text}>
          {weather.temperature}°C · 강수 {weather.precipitationChance}%
        </Text>
      </View>
      {showIndoorHint && <Text style={styles.hint}>☔ 비 예보 - 실내 대체 장소도 고려해보세요</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emoji: {
    fontSize: 22,
  },
  text: {
    color: '#8A9490',
    fontSize: 13,
    fontWeight: '600',
  },
  hint: {
    marginTop: 2,
    color: '#F0B429',
    fontSize: 11,
    fontWeight: '600',
  },
});
