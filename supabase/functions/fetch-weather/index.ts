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
// matchDate는 UTC 기준 Date이므로, Deno 서버(UTC 로컬타임)에서 getHours() 등 로컬 메서드를 쓰면
// KST가 아니라 UTC 시각을 읽게 된다 - 반드시 KST로 직접 보정한 뒤 getUTC*로 읽어야 한다.
function nearestForecastSlot(matchDate: Date): { fcstDate: string; fcstTime: string } {
  const kst = new Date(matchDate.getTime() + 9 * 60 * 60 * 1000);
  const slots = [0, 3, 6, 9, 12, 15, 18, 21];
  const hour = kst.getUTCHours();

  if (hour === 23) {
    // 23시는 같은 날 21시보다 다음날 0시 슬롯이 더 가까움
    const nextDay = new Date(kst.getTime() + 24 * 60 * 60 * 1000);
    return {
      fcstDate: `${nextDay.getUTCFullYear()}${pad(nextDay.getUTCMonth() + 1)}${pad(nextDay.getUTCDate())}`,
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
    fcstDate: `${kst.getUTCFullYear()}${pad(kst.getUTCMonth() + 1)}${pad(kst.getUTCDate())}`,
    fcstTime: `${pad(closest)}00`,
  };
}

interface KmaItem {
  category: string;
  fcstDate: string;
  fcstTime: string;
  fcstValue: string;
}

const RELAY_URL = Deno.env.get('WEATHER_RELAY_URL');
const RELAY_SECRET = Deno.env.get('WEATHER_RELAY_SECRET');

interface RelayResponse {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
  text: () => Promise<string>;
}

// 기상청 API가 Supabase 엣지함수의 발신 IP를 막아서(401), 서울 리전 AWS Lambda를 거쳐 대신 호출한다.
async function fetchViaRelay(url: string): Promise<RelayResponse> {
  if (!RELAY_URL || !RELAY_SECRET) {
    throw new Error('WEATHER_RELAY_URL/WEATHER_RELAY_SECRET가 설정되지 않았습니다.');
  }
  const relayRes = await fetch(RELAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Relay-Secret': RELAY_SECRET },
    body: JSON.stringify({ url }),
  });
  if (!relayRes.ok) {
    const bodyText = await relayRes.text();
    throw new Error(`릴레이 호출 실패 (status ${relayRes.status}): ${bodyText.slice(0, 300)}`);
  }
  const { status, body } = await relayRes.json();
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(body),
    text: async () => body,
  };
}

// "YYYYMMDD"+"HHmm" 형태의 예보 슬롯을 비교 가능한 값으로 변환 (실제 타임존 보정은 필요 없음 - 같은 방식으로만 파싱하면 상대적 거리 비교엔 충분).
function slotToComparable(fcstDate: string, fcstTime: string): number {
  return Number(fcstDate) * 10000 + Number(fcstTime);
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * DEGRAD;
  const dLon = (lon2 - lon1) * DEGRAD;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEGRAD) * Math.cos(lat2 * DEGRAD) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface MidRegion {
  regId: string;
  name: string;
  lat: number;
  lon: number;
}

// 중기육상예보(getMidLandFcst)용 도 단위 구역코드. getFcstZoneCd로 확인한 실제 regId이며,
// 이 API 응답 자체엔 좌표가 없어(집계 구역) 각 권역 대표지점 좌표를 직접 지정했다.
const LAND_REGIONS: MidRegion[] = [
  { regId: '11B00000', name: '서울.인천.경기', lat: 37.5665, lon: 126.978 },
  { regId: '11C10000', name: '충청북도', lat: 36.6424, lon: 127.489 },
  { regId: '11C20000', name: '충청남도', lat: 36.3504, lon: 127.3845 },
  { regId: '11D10000', name: '강원영서', lat: 37.8228, lon: 128.1555 },
  { regId: '11D20000', name: '강원영동', lat: 37.7519, lon: 128.8761 },
  { regId: '11F10000', name: '전북자치도', lat: 35.8242, lon: 127.148 },
  { regId: '11F20000', name: '전라남도', lat: 34.8161, lon: 126.4629 },
  { regId: '11G00000', name: '제주도', lat: 33.4996, lon: 126.5312 },
  { regId: '11H10000', name: '경상북도', lat: 36.576, lon: 128.5056 },
  { regId: '11H20000', name: '경상남도', lat: 35.2285, lon: 128.6811 },
];

// 중기기온예보(getMidTa)용 시 단위 구역코드. getFcstZoneCd 응답의 실제 좌표를 그대로 사용.
const TA_REGIONS: MidRegion[] = [
  { regId: '11B10101', name: '서울', lat: 37.56609444, lon: 126.9774167 },
  { regId: '11B20201', name: '인천', lat: 37.477501, lon: 126.62458 },
  { regId: '11B20601', name: '수원', lat: 37.272293, lon: 126.985367 },
  { regId: '11C10301', name: '청주', lat: 36.63924, lon: 127.440659 },
  { regId: '11C20401', name: '대전', lat: 36.34914444, lon: 127.3843389 },
  { regId: '11C20404', name: '세종', lat: 36.57, lon: 127.27 },
  { regId: '11D10301', name: '춘천', lat: 37.88135, lon: 127.7303972 },
  { regId: '11D20501', name: '강릉', lat: 37.75072778, lon: 128.8769944 },
  { regId: '11F10201', name: '전주', lat: 35.82382222, lon: 127.1520167 },
  { regId: '11F20501', name: '광주', lat: 35.16128056, lon: 126.9158417 },
  { regId: '11G00201', name: '제주', lat: 33.486275, lon: 126.4979528 },
  { regId: '11G00401', name: '서귀포', lat: 33.24612, lon: 126.565331 },
  { regId: '11H10501', name: '안동', lat: 36.56676111, lon: 128.7308417 },
  { regId: '11H10701', name: '대구', lat: 35.87151944, lon: 128.6029722 },
  { regId: '11H20101', name: '울산', lat: 35.53866667, lon: 129.3547361 },
  { regId: '11H20201', name: '부산', lat: 35.104683, lon: 129.032013 },
  { regId: '11H20301', name: '창원', lat: 35.22753889, lon: 128.6819389 },
];

function nearestRegion(regions: MidRegion[], lat: number, lon: number): MidRegion {
  let nearest = regions[0];
  let minDist = haversineDistance(lat, lon, nearest.lat, nearest.lon);
  for (const r of regions) {
    const dist = haversineDistance(lat, lon, r.lat, r.lon);
    if (dist < minDist) {
      minDist = dist;
      nearest = r;
    }
  }
  return nearest;
}

function getMidFcstBaseTime(now: Date): { tmFc: string; announceDateKst: Date } {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const hhmm = kst.getUTCHours() * 100 + kst.getUTCMinutes();

  // 중기예보는 06:00, 18:00 하루 2회 발표 (발표 후 약 20~30분 뒤 반영)
  if (hhmm >= 1830) {
    return { tmFc: `${fmtDate(kst)}1800`, announceDateKst: kst };
  }
  if (hhmm >= 630) {
    return { tmFc: `${fmtDate(kst)}0600`, announceDateKst: kst };
  }
  const prevDay = new Date(kst.getTime() - 24 * 60 * 60 * 1000);
  return { tmFc: `${fmtDate(prevDay)}1800`, announceDateKst: prevDay };
}

function fmtDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

// 발표일(KST 자정 기준) 대비 경기일이 며칠 뒤인지 정수로 계산
function calendarDayDiff(announceDateKst: Date, matchDateIso: string): number {
  const matchKst = new Date(new Date(matchDateIso).getTime() + 9 * 60 * 60 * 1000);
  const announceDay = Date.UTC(announceDateKst.getUTCFullYear(), announceDateKst.getUTCMonth(), announceDateKst.getUTCDate());
  const matchDay = Date.UTC(matchKst.getUTCFullYear(), matchKst.getUTCMonth(), matchKst.getUTCDate());
  return Math.round((matchDay - announceDay) / (24 * 60 * 60 * 1000));
}

interface MidForecast {
  amWeather: string;
  amPop: string;
  pmWeather: string;
  pmPop: string;
  minTemp: string;
  maxTemp: string;
}

async function fetchMidForecast(
  serviceKey: string,
  landRegId: string,
  taRegId: string,
  tmFc: string,
  dayN: number
): Promise<{ data: MidForecast | null; debug: Record<string, unknown> }> {
  const landParams = new URLSearchParams({ serviceKey, pageNo: '1', numOfRows: '1', dataType: 'JSON', regId: landRegId, tmFc });
  const taParams = new URLSearchParams({ serviceKey, pageNo: '1', numOfRows: '1', dataType: 'JSON', regId: taRegId, tmFc });

  let landRes: RelayResponse;
  let taRes: RelayResponse;
  try {
    [landRes, taRes] = await Promise.all([
      fetchViaRelay(`https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst?${landParams.toString()}`),
      fetchViaRelay(`https://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa?${taParams.toString()}`),
    ]);
  } catch (err) {
    return { data: null, debug: { step: 'relay_exception', message: String(err) } };
  }
  if (!landRes.ok || !taRes.ok) {
    return {
      data: null,
      debug: { step: 'relay_not_ok', landStatus: landRes.status, taStatus: taRes.status },
    };
  }

  const landJson = await landRes.json();
  const taJson = await taRes.json();
  const landItem = landJson.response?.body?.items?.item?.[0];
  const taItem = taJson.response?.body?.items?.item?.[0];
  if (!landItem || !taItem) {
    return {
      data: null,
      debug: {
        step: 'no_item',
        landResultCode: landJson.response?.header?.resultCode,
        landResultMsg: landJson.response?.header?.resultMsg,
        taResultCode: taJson.response?.header?.resultCode,
        taResultMsg: taJson.response?.header?.resultMsg,
      },
    };
  }

  // 8~10일차는 오전/오후 구분 없이 통합값만 제공됨
  const hasAmPm = dayN <= 7;
  const amWeather: string | undefined = hasAmPm ? landItem[`wf${dayN}Am`] : landItem[`wf${dayN}`];
  const pmWeather: string | undefined = hasAmPm ? landItem[`wf${dayN}Pm`] : landItem[`wf${dayN}`];
  const amPop = hasAmPm ? landItem[`rnSt${dayN}Am`] : landItem[`rnSt${dayN}`];
  const pmPop = hasAmPm ? landItem[`rnSt${dayN}Pm`] : landItem[`rnSt${dayN}`];
  const minTemp = taItem[`taMin${dayN}`];
  const maxTemp = taItem[`taMax${dayN}`];

  if (!amWeather || !pmWeather || minTemp == null || maxTemp == null) {
    // 이 발표시각 기준으로 그 날짜 예보가 아직 없음(예: 3일차, 또는 아직 안 채워진 경계 케이스)
    return {
      data: null,
      debug: {
        step: 'fields_missing',
        hasAmPm,
        amWeather: amWeather ?? null,
        pmWeather: pmWeather ?? null,
        minTemp: minTemp ?? null,
        maxTemp: maxTemp ?? null,
        landItemKeys: Object.keys(landItem),
        taItemKeys: Object.keys(taItem),
      },
    };
  }

  return {
    data: {
      amWeather,
      pmWeather,
      amPop: String(amPop),
      pmPop: String(pmPop),
      minTemp: String(minTemp),
      maxTemp: String(maxTemp),
    },
    debug: { step: 'ok' },
  };
}

async function fetchShortTermForecast(
  serviceKey: string,
  latitude: number,
  longitude: number,
  matchDate: Date,
  now: Date
): Promise<{ body: Record<string, unknown>; status?: number }> {
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

  let kmaRes: RelayResponse;
  try {
    kmaRes = await fetchViaRelay(
      `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?${params.toString()}`
    );
  } catch (err) {
    return { body: { available: false, reason: 'relay_exception', message: String(err) } };
  }
  if (!kmaRes.ok) {
    const bodyText = await kmaRes.text();
    return {
      body: { error: '날씨 조회에 실패했습니다.', debugStatus: kmaRes.status, debugBody: bodyText.slice(0, 500) },
      status: 502,
    };
  }
  const kmaJson = await kmaRes.json();
  const items: KmaItem[] = kmaJson.response?.body?.items?.item ?? [];

  let slotItems = items.filter((i) => i.fcstDate === fcstDate && i.fcstTime === fcstTime);

  if (slotItems.length === 0) {
    // 정확히 원하는 시각 데이터가 없으면(예보 범위 경계) 가장 가까운 시각의 데이터로 대체한다.
    const wanted = slotToComparable(fcstDate, fcstTime);
    const uniqueSlots = [...new Set(items.map((i) => `${i.fcstDate} ${i.fcstTime}`))];
    let closest: { fcstDate: string; fcstTime: string } | null = null;
    let minDiff = Infinity;
    for (const slot of uniqueSlots) {
      const [d, t] = slot.split(' ');
      const diff = Math.abs(slotToComparable(d, t) - wanted);
      if (diff < minDiff) {
        minDiff = diff;
        closest = { fcstDate: d, fcstTime: t };
      }
    }
    if (closest) {
      slotItems = items.filter((i) => i.fcstDate === closest!.fcstDate && i.fcstTime === closest!.fcstTime);
    }
  }

  if (slotItems.length === 0) {
    const availableSlots = [...new Set(items.map((i) => `${i.fcstDate} ${i.fcstTime}`))];
    return {
      body: {
        available: false,
        reason: 'no_matching_slot',
        wantedSlot: `${fcstDate} ${fcstTime}`,
        baseDate,
        baseTime,
        availableSlots,
      },
    };
  }

  const valueOf = (category: string) => slotItems.find((i) => i.category === category)?.fcstValue ?? null;

  return {
    body: {
      available: true,
      range: 'short',
      temperature: valueOf('TMP'),
      precipitationChance: valueOf('POP'),
      precipitationType: valueOf('PTY'),
      sky: valueOf('SKY'),
      humidity: valueOf('REH'),
    },
  };
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
    if (hoursUntilMatch > 240 || hoursUntilMatch < -3) {
      return Response.json({ available: false, reason: 'out_of_range', hoursUntilMatch });
    }

    const serviceKey = Deno.env.get('KMA_SERVICE_KEY');
    if (!serviceKey) {
      return Response.json({ error: 'KMA_SERVICE_KEY가 설정되지 않았습니다.' }, { status: 500 });
    }

    // 중기예보는 실제로 5일차부터 데이터가 채워진다(4일차 이하 필드는 기상청 응답 자체에 없음).
    // 그래서 72시간~5일차 사이(대략 3~4일 뒤)는 단기예보 범위도 지났고 중기예보도 아직 데이터가
    // 없는 공백 구간이 생긴다. 이 구간에서는 단기예보가 혹시 그 시점까지 데이터를 갖고 있는지
    // 밑져야 본전으로 한 번 더 시도해본다 (안 되면 어차피 지금처럼 조회 불가로 자연스럽게 떨어짐).
    if (hoursUntilMatch > 72) {
      const { tmFc, announceDateKst } = getMidFcstBaseTime(now);
      const dayN = calendarDayDiff(announceDateKst, matchDateIso);

      if (dayN >= 5 && dayN <= 10) {
        const landRegion = nearestRegion(LAND_REGIONS, latitude, longitude);
        const taRegion = nearestRegion(TA_REGIONS, latitude, longitude);
        const { data: mid, debug: midDebug } = await fetchMidForecast(serviceKey, landRegion.regId, taRegion.regId, tmFc, dayN);
        if (mid) {
          return Response.json({ available: true, range: 'mid', ...mid });
        }
        // 중기예보에서 못 받았으면 아래 단기예보 폴백으로 넘어감 (참고용으로 이유는 버림, midDebug는 필요시 로그로만)
        void midDebug;
      }

      const { body, status } = await fetchShortTermForecast(serviceKey, latitude, longitude, matchDate, now);
      return Response.json(body, status ? { status } : undefined);
    }

    const { body, status } = await fetchShortTermForecast(serviceKey, latitude, longitude, matchDate, now);
    return Response.json(body, status ? { status } : undefined);
  }),
};
