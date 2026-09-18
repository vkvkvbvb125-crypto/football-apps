// src/features/auth/authRedirects.ts — 인증 메일이 돌아올 **웹** 주소들
//
// ── 왜 따로 있나 ───────────────────────────────────────────────────
// 이 값들을 **앱 밖에서도 읽어야 한다.** 시험용 메일 재발송 스크립트가 앱과 같은
// redirect를 넘겨야 하는데, authService.ts는 expo-linking·supabase를 import해서
// node에서 못 읽는다. **여기는 import가 하나도 없다** — 그래서 스크립트가 그대로 쓴다.
//
// ⚠ **왜 그게 중요한가 — 2026-09-18에 이걸로 한 번 깨졌다.**
//   kdtest3의 확인 메일을 `/auth/v1/resend`로 직접 재발송하면서 `redirect_to`를
//   안 넘겼다. Supabase는 **Site URL로 떨어지고**, 그 값이 `kickday://auth-callback`
//   이라 데스크톱 브라우저에서 **흰 화면**이 떴다. 계정 확인 자체는 됐는데
//   사용자 눈에는 실패로 보였다.
//   앱의 signUp은 제대로 넘기고 있었다 — **우회한 쪽이 책임을 흘린 것이다**
//   (scripts/lib/anchor.ts 「우회한 명령」).
//   두 벌로 두면 또 갈리므로 **한 자리에 둔다.**
//
// ⚠ 여기 있는 주소는 전부 Supabase의 **Redirect URLs 허용목록**에도 있어야 한다
//   (Authentication > URL Configuration). 없으면 조용히 Site URL로 떨어진다 —
//   오류가 아니라 **다른 곳으로 가는** 실패라 로그만 봐서는 안 보인다.

/**
 * 가입 확인 메일의 착지 주소.
 *
 * ⚠ **`kickday://auth-callback`을 쓰면 안 된다.** 커스텀 스킴이라 브라우저가 열 수
 *   없고, 데스크톱에서 흰 화면이 된다(2026-09-16에 겪었다). 확인 처리는 Supabase가
 *   그 앞에서 끝내므로 **계정은 확인되는데 화면은 아무 말도 안 한다.**
 *   심사자가 데스크톱에서 누르면 같은 것을 본다.
 *
 * 이 주소가 그리는 페이지: `web/auth/confirm/index.html`
 */
export const EMAIL_CONFIRM_REDIRECT = 'https://kickday.app/auth/confirm';

/**
 * 비밀번호 재설정 메일의 착지 주소.
 *
 * ⚠ **가입 확인과 성격이 다르다.** 확인은 Supabase가 리다이렉트 **전에** 끝내므로
 *   그 페이지는 결과를 말해 주기만 한다. 재설정은 **아직 아무것도 안 끝났다** —
 *   토큰으로 세션을 세우고 새 비밀번호를 저장하는 일이 **앱 안에서** 일어난다
 *   (`startRecovery` → `completeRecovery` → `recoveryMode`).
 *   그래서 이 페이지는 프래그먼트를 검사해 `kickday://auth-callback`으로 **넘긴다.**
 *
 * ⚠ 그럼에도 **https여야 한다.** `kickday://`를 직접 쓰면 브라우저가 열 수 없는
 *   주소라 데스크톱에서 흰 화면이 된다(2026-09-18에 가입 확인 쪽에서 겪었다).
 *   폰에서는 앱이 열리므로 **폰만 보면 멀쩁해 보이는** 것이 이 결함의 성질이다.
 *
 * 이 주소가 그리는 페이지: `web/auth/reset/index.html`
 */
export const PASSWORD_RESET_REDIRECT = 'https://kickday.app/auth/reset';
