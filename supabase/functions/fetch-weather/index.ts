import { withSupabase } from 'npm:@supabase/server@^1';

const RE = 6371.00877;
const GRID = 5.0;
const SLAT1 = 30.0;
const SLAT2 = 60.0;
const OLON = 126.0;
const OLAT = 38.0;
const XO = 43;
const YO = 136;
const DEGRAD = Math.PI / 180.0;

function toGrid(lat: number, lon: number): { nx: number; ny: number } {
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}

const BASE_TIMES = ['0200', '0500', '0800', '1100', '1400', '1700', '2000', '2300'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

// 기상청 단기예보는 하루 8회(02,05,08,11,14,17,20,23시) 발표되고, 발표 후 약 10분 뒤부터 API에 반영된다.
function getLatestBaseDateTime(now: Date): { baseDate: string; baseTime: string } {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const hhmm = kst.getUTCHours() * 100 + kst.getUTCMinutes();

  for (let i = BASE_TIMES.length - 1; i >= 0; i--) {
    const t = BASE_TIMES[i];
    if (hhmm >= Number(t) + 10) {
      const baseDate = `${kst.getUTCFullYear()}${pad(kst.getUTCMonth() + 1)}${pad(kst.getUTCDate())}`;
      return { baseDate, baseTime: t };
    }
  }

  // 오늘 발표시각이 아직 하나도 안 지남 -> 전날 23시 발표 사용
  const prevDay = new Date(kst.getTime() - 24 * 60 * 60 * 1000);
  const baseDate = `${prevDay.getUTCFullYear()}${pad(prevDay.getUTCMonth() + 1)}${pad(prevDay.getUTCDate())}`;
  return { baseDate, baseTime: '2300' };
}

// 경기 시각과 가장 가까운 3시간 예보 슬롯(0,3,6,...,21시)을 찾는다.
function nearestForecastSlot(matchDate: Date): { fcstDate: string; fcstTime: string } {
  const slots = [0, 3, 6, 9, 12, 15, 18, 21];
  const hour = matchDate.getHours();

  if (hour === 23) {
    // 23시는 같은 날 21시보다 다음날 0시 슬롯이 더 가까움
    const nextDay = new Date(matchDate.getTime() + 24 * 60 * 60 * 1000);
    return {
      fcstDate: `${nextDay.getFullYear()}${pad(nextDay.getMonth() + 1)}${pad(nextDay.getDate())}`,
      fcstTime: '0000',
    };
  }

  let closest = slots[0];
  let minDiff = Math.abs(hour - slots[0]);
  for (const s of slots) {
    const diff = Math.abs(hour - s);
    if (diff < minDiff) {
      minDiff = diff;
      closest = s;
    }
  }

  return {
    fcstDate: `${matchDate.getFullYear()}${pad(matchDate.getMonth() + 1)}${pad(matchDate.getDate())}`,
    fcstTime: `${pad(closest)}00`,
  };
}

interface KmaItem {
  category: string;
  fcstDate: string;
  fcstTime: string;
  fcstValue: string;
}

export default {
  fetch: withSupabase({ auth: ['publishable', 'secret'] }, async (req) => {
    const { latitude, longitude, matchDateIso } = await req.json();
    if (typeof latitude !== 'number' || typeof longitude !== 'number' || !matchDateIso) {
      return Response.json({ error: 'latitude, longitude, matchDateIso가 필요합니다.' }, { status: 400 });
    }

    const matchDate = new Date(matchDateIso);
    const now = new Date();
    const hoursUntilMatch = (matchDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntilMatch > 72 || hoursUntilMatch < -3) {
      return Response.json({ available: false });
    }

    const serviceKey = Deno.env.get('KMA_SERVICE_KEY');
    if (!serviceKey) {
      return Response.json({ error: 'KMA_SERVICE_KEY가 설정되지 않았습니다.' }, { status: 500 });
    }

    const { nx, ny } = toGrid(latitude, longitude);
    const { baseDate, baseTime } = getLatestBaseDateTime(now);
    const { fcstDate, fcstTime } = nearestForecastSlot(matchDate);

    const params = new URLSearchParams({
      serviceKey,
      numOfRows: '1000',
      pageNo: '1',
      dataType: 'JSON',
      base_date: baseDate,
      base_time: baseTime,
      nx: String(nx),
      ny: String(ny),
    });

    const kmaRes = await fetch(
      `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?${params.toString()}`
    );
    if (!kmaRes.ok) {
      return Response.json({ error: '날씨 조회에 실패했습니다.' }, { status: 502 });
    }
    const kmaJson = await kmaRes.json();
    const items: KmaItem[] = kmaJson.response?.body?.items?.item ?? [];

    const slotItems = items.filter((i) => i.fcstDate === fcstDate && i.fcstTime === fcstTime);
    if (slotItems.length === 0) {
      return Response.json({ available: false });
    }

    const valueOf = (category: string) => slotItems.find((i) => i.category === category)?.fcstValue ?? null;

    return Response.json({
      available: true,
      temperature: valueOf('TMP'),
      precipitationChance: valueOf('POP'),
      precipitationType: valueOf('PTY'),
      sky: valueOf('SKY'),
    });
  }),
};
