import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchMatchWeather, type MatchWeather } from '../services/weatherService';

interface WeatherBadgeProps {
  latitude: number | null;
  longitude: number | null;
  matchDateIso: string;
}

function weatherIconName(pty: string, sky: string): keyof typeof Ionicons.glyphMap {
  if (pty === '1' || pty === '4' || pty === '5') return 'rainy-outline';
  if (pty === '2' || pty === '6') return 'rainy-outline';
  if (pty === '3' || pty === '7') return 'snow-outline';
  if (sky === '1') return 'sunny-outline';
  if (sky === '3') return 'partly-sunny-outline';
  return 'cloudy-outline';
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
        <Ionicons name={weatherIconName(pty, weather.sky ?? '1')} size={14} color="#8A9490" />
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
    marginTop: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  text: {
    color: '#8A9490',
    fontSize: 12,
  },
  hint: {
    marginTop: 2,
    color: '#F0B429',
    fontSize: 11,
    fontWeight: '600',
  },
});
