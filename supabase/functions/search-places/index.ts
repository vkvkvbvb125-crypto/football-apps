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
    const { query, latitude, longitude } = await req.json();
    if (!query || !query.trim()) {
      return Response.json({ error: 'query가 필요합니다.' }, { status: 400 });
    }

    // KAKAO_CLIENT_ID는 kakao-login에서도 쓰는 카카오 REST API 키(카카오 OAuth의 client_id = REST API 키)
    const restApiKey = Deno.env.get('KAKAO_CLIENT_ID');
    if (!restApiKey) {
      return Response.json({ error: 'KAKAO_CLIENT_ID가 설정되지 않았습니다.' }, { status: 500 });
    }

    const params = new URLSearchParams({ query });
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      // 카카오 로컬 API: x=경도, y=위도. 위치가 있으면 반경 20km 내에서 가까운 순으로 정렬.
      params.set('x', String(longitude));
      params.set('y', String(latitude));
      params.set('radius', '20000');
      params.set('sort', 'distance');
    }

    const url = `https://dapi.kakao.com/v2/local/search/keyword.json?${params.toString()}`;
    const kakaoRes = await fetch(url, {
      headers: { Authorization: `KakaoAK ${restApiKey}` },
    });
    if (!kakaoRes.ok) {
      return Response.json({ error: '장소 검색에 실패했습니다.' }, { status: 502 });
    }
    const kakaoJson = await kakaoRes.json();

    /*
      ⚠ **「0건」과 「응답이 이상하다」를 가른다.**

      전에는 `kakaoJson.documents ?? []`였다. documents가 **없으면** 빈 배열이 되고,
      화면에는 「검색 결과가 없어요」가 뜬다 — **실패와 성공의 출력이 같아진다.**
      카카오가 200에 오류 본문을 주면(키 문제·쿼터) 사용자는 「그 근처엔 구장이 없구나」로
      읽고, 총무는 아무리 검색해도 못 찾는다. 아무도 원인을 모른다.

      401·429는 위의 `kakaoRes.ok`에서 이미 502로 갈린다. 여기가 막는 것은
      **200인데 documents가 없는** 경우 하나다.

      ⚠ 빈 배열은 통과시킨다 — 그건 진짜 0건이고 「검색 결과가 없어요」가 맞는 말이다.
        갈라야 하는 것은 **없는 것**과 **빈 것**이지 0건 자체가 아니다.
      ⚠ 502가 화면까지 닿는 것을 확인했다 — PlaceSearchModal의 catch가
        「검색에 실패했어요」를 세운다. 안 그러면 이 고침은 반쪽이다.
    */
    if (!Array.isArray(kakaoJson.documents)) {
      return Response.json({ error: '장소 검색에 실패했습니다.' }, { status: 502 });
    }
    const documents: KakaoDocument[] = kakaoJson.documents;

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
