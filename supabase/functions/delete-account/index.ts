// supabase/functions/delete-account/index.ts
// 계정 삭제 (D-5) — 앱 안에서 탈퇴가 되어야 심사를 통과한다 (App Store 5.1.1(v)).
//
// auth.users의 DELETE는 service_role만 할 수 있다. anon key로는 불가능하고, RPC를
// security definer로 만들어도 auth 스키마 소유자 권한이 필요하다. 그래서 함수가 필요하다.
//
// ── 이 파일의 순서가 곧 안전장치다 ────────────────────────────────────
//   1. 토큰에서 사용자를 확인한다 (본문의 uid는 절대 안 믿는다)
//   2. 사용자 토큰으로 판정을 받는다 → 안 되면 여기서 끝
//   ─── 여기까지 service_role을 한 번도 쓰지 않는다 ───
//   3. 그 뒤에야 지운다
//
// 순서가 섞이면 「검증 전에 지우는 코드」가 생긴다. 2단계 위쪽에 admin 클라이언트를
// 쓰는 줄이 하나라도 생기면 그게 사고다 — 아래 주석 경계선을 넘기지 말 것.
//
// 판정은 여기서 다시 쓰지 않는다. account_deletion_status()가 규칙을 갖고 있고,
// 화면(D-6)도 같은 함수를 본다. 규칙이 두 벌이면 화면은 된다고 하고 서버는 거절한다.
import { withSupabase } from 'npm:@supabase/server@^1';

// 카카오 연결 끊기용. 없으면 unlink를 건너뛴다 — 키가 아직 안 꽂혔다고 탈퇴가 막히면 안 된다.
const KAKAO_ADMIN_KEY = Deno.env.get('KAKAO_ADMIN_KEY');

export default {
  fetch: withSupabase({ auth: ['publishable', 'secret'] }, async (req, ctx) => {
    // ── 1. 누구인지 ──────────────────────────────────────────────
    // 본문으로 받은 uid를 쓰면 남의 계정을 지울 수 있다. 토큰에서만 꺼낸다.
    const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!jwt) {
      return Response.json({ error: '로그인이 필요해요.' }, { status: 401 });
    }
    const { data: authData, error: authError } = await ctx.supabaseAdmin.auth.getUser(jwt);
    const user = authData?.user;
    if (authError || !user) {
      return Response.json({ error: '로그인이 만료됐어요. 다시 로그인해 주세요.' }, { status: 401 });
    }

    // ── 2. 지워도 되는지 ─────────────────────────────────────────
    // 사용자 토큰으로 부른다. service_role로 부르면 auth.uid()가 null이 되어 판정이
    // 헛돈다. 함수 쪽에서도 그때는 거부하도록 닫아 뒀지만(no_auth), 여기서도 안 만든다.
    const url = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
    if (!url || !anonKey) {
      // 키 이름이 바뀌었는데 service_role로 대신 부르면 「전원 삭제 가능」이 된다.
      // 조용히 넘어가지 않고 선다.
      console.error('delete-account: SUPABASE_URL 또는 anon key 없음 — 판정을 못 한다');
      return Response.json({ error: '서버 설정 오류예요.' }, { status: 500 });
    }
    const statusRes = await fetch(`${url}/rest/v1/rpc/account_deletion_status`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    if (!statusRes.ok) {
      return Response.json({ error: '탈퇴 가능 여부를 확인하지 못했어요.' }, { status: 502 });
    }
    const status = await statusRes.json();

    // 내가 검증한 사용자와 함수가 판정한 사용자가 같아야 한다.
    // 다르면 토큰이 바뀌어 들어간 것이고, 그대로 진행하면 엉뚱한 계정을 지운다.
    if (status?.uid !== user.id) {
      console.error(`delete-account: 판정 대상 불일치 (token=${user.id} status=${status?.uid})`);
      return Response.json({ error: '확인에 실패했어요.' }, { status: 409 });
    }
    if (!status.can_delete) {
      // 화면이 그대로 띄울 수 있게 판정을 통째로 넘긴다 — 여기서 문구를 만들면
      // 화면과 서버가 서로 다른 이유를 말하게 된다.
      return Response.json({ error: '아직 탈퇴할 수 없어요.', status }, { status: 409 });
    }

    // ─────────────────────────────────────────────────────────────
    // 여기서부터 service_role 구간. 위쪽에는 admin 쓰기가 없어야 한다.
    // ─────────────────────────────────────────────────────────────

    // ── 3. 카카오 연결 끊기 ──────────────────────────────────────
    // 삭제보다 먼저 한다. 계정을 먼저 지우면 profiles가 cascade로 사라져서
    // kakao_id를 잃고, unlink를 시도조차 못 한다.
    //
    // 실패해도 삭제는 진행한다. 카카오 API 장애로 본인 탈퇴가 막히면 안 되고
    // (남의 미납으로 안 막는 것과 같은 이유), 심사에서도 외부 API 상태가 계정 삭제를
    // 막는 건 문제가 된다. 연결이 남아도 계정은 이미 없어서, 그 연결로 로그인하면
    // 새 계정이 된다. 대신 나중에 손으로 정리할 수 있게 카카오 ID를 로그에 남긴다.
    const { data: profile } = await ctx.supabaseAdmin
      .from('profiles')
      .select('kakao_id')
      .eq('id', user.id)
      .maybeSingle();
    const kakaoId = profile?.kakao_id ?? null;

    let kakaoUnlinked: boolean | null = null; // null = 대상 아님(카카오 계정이 아니거나 키 없음)
    if (kakaoId && KAKAO_ADMIN_KEY) {
      try {
        const res = await fetch('https://kapi.kakao.com/v1/user/unlink', {
          method: 'POST',
          headers: {
            Authorization: `KakaoAK ${KAKAO_ADMIN_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `target_id_type=user_id&target_id=${encodeURIComponent(kakaoId)}`,
        });
        kakaoUnlinked = res.ok;
        if (!res.ok) {
          console.error(`delete-account: 카카오 unlink 실패 kakao_id=${kakaoId} status=${res.status} body=${await res.text()}`);
        }
      } catch (e) {
        kakaoUnlinked = false;
        console.error(`delete-account: 카카오 unlink 예외 kakao_id=${kakaoId} ${e}`);
      }
    } else if (kakaoId && !KAKAO_ADMIN_KEY) {
      console.error(`delete-account: KAKAO_ADMIN_KEY 없음 — unlink 건너뜀 kakao_id=${kakaoId}`);
    }

    // 네이버는 대상이 아니다. naver-login이 provider_id를 auth.users 메타데이터에만
    // 넣고 profiles에는 안 남겨서, 여기서 연결 해제 대상을 찾을 방법이 없다.
    // 연결은 남지만 계정은 지워지므로 다시 로그인하면 새 계정이 된다.

    // ── 4. 삭제 ─────────────────────────────────────────────────
    // profiles → team_members → 나머지가 cascade로 따라간다.
    // 경기·공지·투표는 작성자만 null이 되고 남는다 (D-1).
    const { error: deleteError } = await ctx.supabaseAdmin.auth.admin.deleteUser(user.id);
    if (deleteError) {
      console.error(`delete-account: 삭제 실패 uid=${user.id} kakao_id=${kakaoId} ${deleteError.message}`);
      return Response.json({ error: '탈퇴 처리에 실패했어요. 잠시 후 다시 시도해 주세요.' }, { status: 500 });
    }

    return Response.json({ deleted: true, kakaoUnlinked });
  }),
};
