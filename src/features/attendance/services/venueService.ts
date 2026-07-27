// src/features/attendance/services/venueService.ts
// 제휴구장 + 예약 슬롯 조회. 경기 만들기 시트의 구장 목록이 이걸 쓴다.
// venues/venue_slots 테이블엔 아직 실제 데이터가 없어서 지금은 대부분 빈 배열을
// 돌려주지만, 쿼리 자체는 실제라서 나중에 구장 데이터를 채우면 코드 변경 없이 뜬다.
import { supabase } from '../../../lib/supabase';

export interface VenueSlot {
  id: string;
  startTime: string; // "20:00"
  endTime: string; // "21:00"
  isAvailable: boolean;
}

export interface Venue {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  isIndoor: boolean;
  isPartner: boolean;
  hourlyPrice: number | null;
  maxPlayers: number | null;
  amenities: string[];
  usedByTeams: number;
  slots: VenueSlot[];
}

const hhmm = (t: string) => t.slice(0, 5);

/** 특정 날짜의 제휴구장 + 그 날 예약 슬롯 */
export async function fetchPartnerVenues(date: Date): Promise<Venue[]> {
  const slotDate = date.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('venues')
    .select(
      `id, name, address, latitude, longitude, is_indoor, is_partner,
       hourly_price, max_players, amenities, used_by_teams,
       venue_slots ( id, start_time, end_time, is_available, slot_date )`
    )
    .eq('is_partner', true)
    .eq('venue_slots.slot_date', slotDate)
    .order('used_by_teams', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((v) => ({
    id: v.id,
    name: v.name,
    address: v.address,
    latitude: v.latitude,
    longitude: v.longitude,
    isIndoor: v.is_indoor,
    isPartner: v.is_partner,
    hourlyPrice: v.hourly_price,
    maxPlayers: v.max_players,
    amenities: v.amenities ?? [],
    usedByTeams: v.used_by_teams ?? 0,
    slots: (v.venue_slots ?? [])
      .map((s) => ({ id: s.id, startTime: hhmm(s.start_time), endTime: hhmm(s.end_time), isAvailable: s.is_available }))
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
  }));
}

/** 우천 대응 — 실내 구장만 (거리순 정렬은 호출부에서) */
export async function fetchIndoorVenues(): Promise<Venue[]> {
  const { data, error } = await supabase
    .from('venues')
    .select('id, name, address, latitude, longitude, is_indoor, is_partner, hourly_price, max_players, amenities, used_by_teams')
    .eq('is_indoor', true)
    .order('used_by_teams', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((v) => ({
    id: v.id,
    name: v.name,
    address: v.address,
    latitude: v.latitude,
    longitude: v.longitude,
    isIndoor: v.is_indoor,
    isPartner: v.is_partner,
    hourlyPrice: v.hourly_price,
    maxPlayers: v.max_players,
    amenities: v.amenities ?? [],
    usedByTeams: v.used_by_teams ?? 0,
    slots: [],
  }));
}

/** 슬롯 예약 요청 — 경기 생성과 함께 호출 */
export async function requestSlot(slotId: string, matchId: string) {
  const { error } = await supabase.from('venue_slots').update({ is_available: false }).eq('id', slotId).eq('is_available', true);
  if (error) throw error;
  return matchId;
}

/** UI 표기용 요약: "도보 8분 · 12명 · 시간당 60,000원" */
export function venueMeta(v: Venue, walkMinutes?: number) {
  return [
    walkMinutes != null ? `도보 ${walkMinutes}분` : null,
    v.maxPlayers != null ? `${v.maxPlayers}명` : null,
    v.hourlyPrice != null ? `시간당 ${v.hourlyPrice.toLocaleString()}원` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
