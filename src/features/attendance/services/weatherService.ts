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

const MAX_CONCURRENT_REQUESTS = 3;
let activeRequestCount = 0;
const requestQueue: (() => void)[] = [];

function acquireSlot(): Promise<void> {
  return new Promise((resolve) => {
    if (activeRequestCount < MAX_CONCURRENT_REQUESTS) {
      activeRequestCount++;
      resolve();
    } else {
      requestQueue.push(() => {
        activeRequestCount++;
        resolve();
      });
    }
  });
}

function releaseSlot() {
  activeRequestCount--;
  const next = requestQueue.shift();
  if (next) next();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 한 화면에서 날씨 조회가 여러 개(캘린더 최대 10일치 + 경기 카드마다) 동시에 나가면
// 기상청 API가 순간적으로 몰린 요청을 거부하는 경우가 있어, 동시 3개로 제한하고
// 실패 시 짧게 대기 후 재시도한다.
export async function fetchMatchWeather(
  latitude: number,
  longitude: number,
  matchDateIso: string
): Promise<MatchWeather> {
  await acquireSlot();
  try {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await delay(attempt * 500);
      const { data, error } = await supabase.functions.invoke('fetch-weather', {
        body: { latitude, longitude, matchDateIso },
      });
      if (!error) return data as MatchWeather;
      lastError = error;
    }
    throw lastError;
  } finally {
    releaseSlot();
  }
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
