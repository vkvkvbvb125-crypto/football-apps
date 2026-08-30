// supabase/functions/naver-login/index.ts
// 네이버 간편 로그인. kakao-login과 같은 구조다 — 네이버는 Supabase 내장 provider가
// 아니라서 인가 코드를 직접 교환하고, 그 결과로 매직링크 token_hash를 돌려준다.
//
// 배포:  supabase functions deploy naver-login
// 시크릿: supabase secrets set NAVER_CLIENT_ID=... NAVER_CLIENT_SECRET=...
import { withSupabase } from 'npm:@supabase/server@^1';

const NAVER_CLIENT_ID = Deno.env.get('NAVER_CLIENT_ID')!;
const NAVER_CLIENT_SECRET = Deno.env.get('NAVER_CLIENT_SECRET')!;

export default {
  fetch: withSupabase({ auth: ['publishable', 'secret'] }, async (req, ctx) => {
    const { code, state, redirect_uri } = await req.json();
    if (!code) {
      return Response.json({ error: 'code가 필요합니다.' }, { status: 400 });
    }

    // 1. 인가 코드 -> 액세스 토큰
    const tokenRes = await fetch('https://nid.naver.com/oauth2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: NAVER_CLIENT_ID,
        client_secret: NAVER_CLIENT_SECRET,
        code,
        // 네이버는 state를 필수로 검증한다
        state: state ?? '',
        ...(redirect_uri ? { redirect_uri } : {}),
      }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.access_token) {
      return Response.json({ error: '네이버 토큰 교환 실패', detail: tokenJson }, { status: 400 });
    }

    // 2. 사용자 정보 조회
    const userRes = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const userJson = await userRes.json();
    if (!userRes.ok || userJson.resultcode !== '00') {
      return Response.json({ error: '네이버 사용자 정보 조회 실패', detail: userJson }, { status: 400 });
    }

    const naverId = String(userJson.response?.id ?? '');
    if (!naverId) {
      return Response.json({ error: '네이버 사용자 ID를 받지 못했습니다.' }, { status: 400 });
    }
    const nickname = userJson.response?.nickname ?? userJson.response?.name ?? '멤버';
    const avatarUrl = userJson.response?.profile_image ?? null;

    // Supabase auth.users는 email이 필요해서, 네이버 ID 기반의 실제로 안 쓰는 고정 이메일을 부여.
    // (카카오와 같은 규칙 — provider가 달라도 계정이 섞이지 않게 접두사로 구분한다)
    // ⚠ 브랜드가 바뀌어도 이 도메인은 그대로 둔다 — 바꾸면 기존 가입자를 못 찾는다.
    const syntheticEmail = `naver-${naverId}@users.futsalclub.app`;

    // 3. 사용자 생성 — 이미 있으면 그냥 넘어간다.
    //
    // 예전엔 listUsers()로 먼저 찾아봤는데, 그건 첫 페이지(기본 50명)만 준다.
    // 51번째부터는 "없다"고 판단해 새로 만들려다 중복으로 실패했다.
    // 페이지를 도는 대신 그냥 만들어보고 중복이면 넘어간다 — 어차피 아래 generateLink는
    // 기존 사용자에게도 똑같이 동작한다.
    const { error: createError } = await ctx.supabaseAdmin.auth.admin.createUser({
      email: syntheticEmail,
      email_confirm: true,
      user_metadata: {
        provider_id: naverId,
        provider: 'naver',
        full_name: nickname,
        avatar_url: avatarUrl,
      },
    });
    const alreadyExists =
      createError && /already been registered|already exists|duplicate/i.test(createError.message);
    if (createError && !alreadyExists) {
      return Response.json({ error: '사용자 생성 실패', detail: createError.message }, { status: 400 });
    }

    // 4. 매직링크로 로그인용 token_hash 발급 (메일은 보내지 않고 hashed_token만 쓴다)
    const { data: linkData, error: linkError } = await ctx.supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: syntheticEmail,
    });
    if (linkError || !linkData) {
      return Response.json({ error: '로그인 링크 생성 실패', detail: linkError?.message }, { status: 400 });
    }

    return Response.json({ token_hash: linkData.properties.hashed_token });
  }),
};
