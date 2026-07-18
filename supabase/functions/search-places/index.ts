import { withSupabase } from 'npm:@supabase/server@^1';

interface KakaoDocument {
  id: string;
  place_name: string;
  category_name: string;
  address_name: string;
  road_address_name: string;
  x: string;
  y: string;
}

export default {
  fetch: withSupabase({ auth: ['publishable', 'secret'] }, async (req) => {
    const { query } = await req.json();
    if (!query || !query.trim()) {
      return Response.json({ error: 'query가 필요합니다.' }, { status: 400 });
    }

    // KAKAO_CLIENT_ID는 kakao-login에서도 쓰는 카카오 REST API 키(카카오 OAuth의 client_id = REST API 키)
    const restApiKey = Deno.env.get('KAKAO_CLIENT_ID');
    if (!restApiKey) {
      return Response.json({ error: 'KAKAO_CLIENT_ID가 설정되지 않았습니다.' }, { status: 500 });
    }

    const url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}`;
    const kakaoRes = await fetch(url, {
      headers: { Authorization: `KakaoAK ${restApiKey}` },
    });
    if (!kakaoRes.ok) {
      return Response.json({ error: '장소 검색에 실패했습니다.' }, { status: 502 });
    }
    const kakaoJson = await kakaoRes.json();
    const documents: KakaoDocument[] = kakaoJson.documents ?? [];

    const results = documents.map((d) => ({
      id: d.id,
      name: d.place_name,
      category: d.category_name.split('>').pop()?.trim() ?? '',
      address: d.road_address_name || d.address_name,
      latitude: Number(d.y),
      longitude: Number(d.x),
    }));

    return Response.json({ results });
  }),
};
