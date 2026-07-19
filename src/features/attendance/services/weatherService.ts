import { supabase } from '../../../lib/supabase';

export interface MatchWeather {
  available: boolean;
  temperature?: string;
  precipitationChance?: string;
  precipitationType?: string;
  sky?: string;
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
