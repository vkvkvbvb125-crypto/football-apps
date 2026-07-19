import { supabase } from '../../../lib/supabase';

export interface MatchWeather {
  available: boolean;
  range?: 'short' | 'mid';
  temperature?: string;
  precipitationChance?: string;
  precipitationType?: string;
  sky?: string;
  amWeather?: string;
  amPop?: string;
  pmWeather?: string;
  pmPop?: string;
  minTemp?: string;
  maxTemp?: string;
}

export async function fetchMatchWeather(
  latitude: number,
  longitude: number,
  matchDateIso: string
): Promise<MatchWeather> {
  const { data, error } = await supabase.functions.invoke('fetch-weather', {
    body: { latitude, longitude, matchDateIso },
  });
  if (error) throw error;
  return data as MatchWeather;
}

export function weatherEmoji(pty: string, sky: string): string {
  if (pty === '1' || pty === '4' || pty === '5') return '🌧️';
  if (pty === '2' || pty === '6') return '🌨️';
  if (pty === '3' || pty === '7') return '❄️';
  if (sky === '1') return '☀️';
  if (sky === '3') return '⛅';
  return '☁️';
}

export function weatherLabel(pty: string, sky: string): string {
  if (pty === '1' || pty === '4' || pty === '5') return '비';
  if (pty === '2' || pty === '6') return '비/눈';
  if (pty === '3' || pty === '7') return '눈';
  if (sky === '1') return '맑음';
  if (sky === '3') return '구름많음';
  return '흐림';
}
