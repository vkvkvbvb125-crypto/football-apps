import { supabase } from '../../../lib/supabase';

export interface PlaceResult {
  id: string;
  name: string;
  category: string;
  address: string;
  latitude: number;
  longitude: number;
}

export async function searchPlaces(
  query: string,
  location?: { latitude: number; longitude: number }
): Promise<PlaceResult[]> {
  const { data, error } = await supabase.functions.invoke('search-places', {
    body: { query, latitude: location?.latitude, longitude: location?.longitude },
  });
  if (error) throw error;
  return data.results as PlaceResult[];
}
