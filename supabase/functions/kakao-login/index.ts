import { withSupabase } from 'npm:@supabase/server@^1';

const KAKAO_CLIENT_ID = Deno.env.get('KAKAO_CLIENT_ID')!;
const KAKAO_CLIENT_SECRET = Deno.env.get('KAKAO_CLIENT_SECRET')!;

export default {
  fetch: withSupabase({ auth: ['publishable', 'secret'] }, async (req, ctx) => {
    const { code, redirect_uri, access_token } = await req.json();

    // 네이티브 카카오 SDK(앱-투-앱 로그인)는 클라이언트에서 이미 액세스 토큰을 들고 있어서
    // code/redirect_uri 교환이 필요 없다 — access_token이 오면 1단계를 건너뛴다.
    // 웹 OAuth 플로우(code+redirect_uri)는 그대로 유지해 웹 프리뷰에서도 로그인이 된다.
    let kakaoAccessToken: string;
    if (access_token) {
      kakaoAccessToken = access_token;
    } else if (code && redirect_uri) {
      // 1. 카카오 인가 코드 -> 액세스 토큰 교환
      const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: KAKAO_CLIENT_ID,
          client_secret: KAKAO_CLIENT_SECRET,
          redirect_uri,
          code,
        }),
      });
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok) {
        return Response.json({ error: '카카오 토큰 교환 실패', detail: tokenJson }, { status: 400 });
      }
      kakaoAccessToken = tokenJson.access_token;
    } else {
      return Response.json({ error: 'access_token 또는 (code, redirect_uri)가 필요합니다.' }, { status: 400 });
    }

    // 2. 카카오 사용자 정보 조회 (이메일 없이 닉네임/프로필사진만)
    const userRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${kakaoAccessToken}` },
    });
    const kakaoUser = await userRes.json();
    if (!userRes.ok) {
      return Response.json({ error: '카카오 사용자 정보 조회 실패', detail: kakaoUser }, { status: 400 });
    }

    const kakaoId = String(kakaoUser.id);
    const nickname = kakaoUser.kakao_account?.profile?.nickname ?? kakaoUser.properties?.nickname ?? '멤버';
    const avatarUrl =
      kakaoUser.kakao_account?.profile?.profile_image_url ?? kakaoUser.properties?.profile_image ?? null;
    // Supabase auth.users는 email이 필요해서, 카카오 ID 기반의 실제로 안 쓰는 고정 이메일을 부여.
    //
    // ⚠ 이 도메인은 브랜드가 KickDay로 바뀐 뒤에도 그대로 둔다. 이미 가입한 사람의
    //   auth.users.email이 이 값이라, 바꾸면 같은 카카오 계정으로 다시 들어와도 기존
    //   사용자를 못 찾고 새 계정이 생긴다(팀·정산 기록이 전부 끊긴다).
    //   실제로 메일이 오가는 주소가 아니라 사용자 눈에 띄지도 않는다.
    const syntheticEmail = `kakao-${kakaoId}@users.futsalclub.app`;

    // 3. profiles에서 기존 사용자 찾기, 없으면 새로 생성
    const { data: existingProfile } = await ctx.supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('kakao_id', kakaoId)
      .maybeSingle();

    if (!existingProfile) {
      const { error: createError } = await ctx.supabaseAdmin.auth.admin.createUser({
        email: syntheticEmail,
        email_confirm: true,
        user_metadata: {
          provider_id: kakaoId,
          full_name: nickname,
          avatar_url: avatarUrl,
        },
      });
      if (createError) {
        return Response.json({ error: '사용자 생성 실패', detail: createError.message }, { status: 400 });
      }
    }

    // 4. 매직링크를 생성해 로그인용 token_hash 발급 (실제 메일은 발송하지 않고 hashed_token만 사용)
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
