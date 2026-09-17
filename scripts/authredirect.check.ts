/*
  인증 메일·리다이렉트를 내는 호출이 **돌아올 주소를 명시하는가.**

  ── 왜 이 검사가 있나 ──────────────────────────────────────────────
  Supabase의 auth 호출은 `redirect_to`를 안 주면 **조용히 Site URL로 떨어진다.**
  오류가 아니라 **다른 곳으로 가는** 실패다 — HTTP 200이 그대로 오고, 로그만 봐서는
  안 보인다. 이 저장소가 여러 번 본 「실패와 성공의 출력이 같다」의 또 한 자리다.

  2026-09-18에 실제로 깨졌다. kdtest3의 확인 메일을 `/auth/v1/resend`로 직접 쏘면서
  `redirect_to`를 빠뜨렸고, Site URL이 `kickday://auth-callback`이라
  **데스크톱에서 흰 화면**이 떴다. `email_confirmed_at`은 찍혔다 — 계정은 확인됐는데
  화면은 아무 말도 안 했다. 심사자가 데스크톱에서 누르면 같은 것을 본다.

  ⚠ **앱은 제대로 넘기고 있었다.** 깨진 것은 앱을 우회한 쪽이다
    (`scripts/lib/anchor.ts` 「우회한 명령」). 그래서 이 검사는 **앱 코드와
    시험용 스크립트를 같이** 본다 — 앱만 지키면 오늘 난 사고를 못 막는다.

  ── 이 검사가 보는 것 ─────────────────────────────────────────────
  ⑴ 메일을 보내거나 브라우저를 돌려보내는 supabase.auth 호출이 **redirect를 넘긴다**
  ⑵ 웹 착지 주소가 **import 없는 파일 하나**에 있다 — 스크립트가 읽을 수 있게
  ⑶ 앱과 스크립트가 **그 상수를 쓴다** — 주소를 손으로 다시 적지 않는다

  ⚠ ⑵가 없으면 ⑶이 불가능하다. authService.ts는 expo-linking·supabase를 import해서
    node에서 안 열린다 — 값을 거기 두면 스크립트는 베껴 적는 수밖에 없고,
    베껴 적은 값은 갈린다. 그게 오늘 난 사고의 모양이다.

  ⚠ 못 보는 것: **그 주소가 Supabase 허용목록에 있는지**는 대시보드 값이라 못 본다.
    없으면 역시 조용히 Site URL로 떨어진다. authRedirects.ts 머리말에 적어 뒀고,
    그걸 지키는 것은 사람이다.
*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').split('\r').join('');
/*
  ⚠ **URL의 `//`를 줄 주석으로 읽으면 안 된다.** 이 검사가 보는 값이 바로 URL이라
    `'https://kickday.app/auth/confirm'`이 `'https:`로 잘려서 **있는데 없다고** 읽었다.
    2026-09-18에 이 검사를 처음 돌리자마자 걸렸다 — 주석을 걷다가 코드를 깨뜨린 자리다.
    `:` 뒤의 `//`는 주석이 아니다.
*/
const strip = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(String.fromCharCode(10))
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join(String.fromCharCode(10));

const CONST_FILE = 'src/features/auth/authRedirects.ts';
const SERVICE = 'src/features/auth/services/authService.ts';
const SCRIPT = 'scripts/authmail.ts';

/*
  돌아올 주소가 필요한 메서드와, 그 메서드가 쓰는 키.

  ⚠ **새 메서드를 쓰기 시작하면 여기 추가해라.** 목록이 손으로 관리되는 것을 알고
    둔다 — 소스에서 「메일을 보내는 호출이 몇 개인지」를 알 방법이 없다.
    그래서 아래 ⑴-b가 **목록 밖의 auth 호출이 새로 생겼는지**를 따로 센다.
*/
const NEEDS_REDIRECT: Record<string, string> = {
  signUp: 'emailRedirectTo',
  signInWithOtp: 'emailRedirectTo',
  resend: 'emailRedirectTo',
  resetPasswordForEmail: 'redirectTo',
  signInWithOAuth: 'redirectTo',
};
/* 돌아올 주소가 필요 없는 것 — 세션으로 끝나거나 메일을 안 보낸다 */
const NO_REDIRECT = new Set([
  'verifyOtp',
  'updateUser',
  'signInWithPassword',
  'signOut',
  'getSession',
  'getUser',
  'setSession',
  'refreshSession',
  'onAuthStateChange',
  'exchangeCodeForSession',
]);

/* ── ⑴ 앱의 호출이 redirect를 넘기는가 ──────────────────────────── */
{
  const files = readdirSync(new URL('../src/features/auth/services', import.meta.url)).filter((f) =>
    f.endsWith('.ts')
  );
  assert.ok(files.length > 0, 'auth 서비스 파일을 못 찾았다 — 경로가 바뀌었으면 이 검사도 고쳐라');

  let checked = 0;
  for (const f of files) {
    const src = strip(read(`src/features/auth/services/${f}`));
    const re = /supabase\.auth\.(\w+)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const method = m[1];
      const key = NEEDS_REDIRECT[method];
      if (!key) {
        /* ⑴-b 목록에 없는 새 메서드 — 사람이 판단해서 둘 중 하나에 넣어야 한다 */
        assert.ok(
          NO_REDIRECT.has(method),
          `supabase.auth.${method}를 새로 쓴다(${f}) — 돌아올 주소가 필요한지 판단해서 ` +
            `authredirect.check의 NEEDS_REDIRECT나 NO_REDIRECT에 넣어라. ` +
            `필요한데 안 넘기면 조용히 Site URL로 떨어진다`
        );
        continue;
      }
      /*
        호출 본문만 본다. 괄호 균형을 세서 끝을 찾는다 —
        고정 길이로 자르면 긴 호출에서 뒤가 잘려 **있는데 없다고** 읽는다.
      */
      let depth = 0;
      let end = m.index + m[0].length - 1;
      for (let i = end; i < src.length; i++) {
        if (src[i] === '(') depth++;
        else if (src[i] === ')') {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      const call = src.slice(m.index, end + 1);
      /*
        ⚠ **축약 문법을 같이 본다.** `{ redirectTo }`는 `redirectTo:`가 아니다 —
          `:`만 보면 실제로 넘기는 코드를 「안 넘긴다」로 잡는다.
          2026-09-18에 이 검사를 처음 돌리자마자 signInWithOAuth가 그렇게 걸렸다.
      */
      assert.ok(
        new RegExp(`\\b${key}\\s*[,:}\n]`).test(call),
        `${f}의 supabase.auth.${method}가 ${key}를 안 넘긴다 — ` +
          `Supabase가 조용히 Site URL로 떨어뜨린다. 오류가 안 나서 로그로는 안 보인다`
      );
      checked++;
    }
  }
  assert.ok(checked >= 3, `redirect를 검사한 호출이 ${checked}개뿐이다 — 정규식이 안 맞나`);
}

/* ── ⑵ 웹 착지 주소가 import 없는 파일에 있는가 ──────────────────── */
{
  const raw = read(CONST_FILE);
  const body = strip(raw);
  /*
    ⚠ **import가 하나라도 있으면 node가 못 읽을 수 있다.** expo-linking이든 supabase든
      RN 전용 모듈이 딸려 오는 순간 스크립트에서 이 파일을 import할 수 없게 되고,
      그러면 값을 베껴 적게 된다. 베낀 값은 갈린다 — 그게 오늘 난 사고다.
  */
  assert.ok(
    !/^\s*import\s/m.test(body),
    `${CONST_FILE}에 import가 생겼다 — 이 파일은 node에서 그대로 읽혀야 한다. ` +
      `RN 전용 모듈이 딸려 오면 scripts/authmail.ts가 이 값을 못 쓰고 베껴 적게 된다`
  );
  assert.ok(
    /export const EMAIL_CONFIRM_REDIRECT = 'https:\/\//.test(body),
    `${CONST_FILE}의 EMAIL_CONFIRM_REDIRECT가 https 주소가 아니다 — ` +
      `커스텀 스킴이면 데스크톱에서 흰 화면이 된다`
  );
}

/* ── ⑶ 앱과 스크립트가 그 상수를 쓰는가 ──────────────────────────── */
{
  const svc = strip(read(SERVICE));
  assert.ok(
    /import \{[^}]*EMAIL_CONFIRM_REDIRECT[^}]*\} from '\.\.\/authRedirects'/.test(svc),
    `${SERVICE}가 EMAIL_CONFIRM_REDIRECT를 import하지 않는다`
  );
  assert.ok(
    !/emailConfirmRedirectTo = '/.test(svc),
    `${SERVICE}가 확인 주소를 문자열로 다시 적는다 — 상수와 갈릴 수 있다`
  );

  const sc = strip(read(SCRIPT));
  assert.ok(
    /import \{[^}]*EMAIL_CONFIRM_REDIRECT[^}]*\} from '\.\.\/src\/features\/auth\/authRedirects/.test(sc),
    `${SCRIPT}가 EMAIL_CONFIRM_REDIRECT를 import하지 않는다 — ` +
      `주소를 손으로 적으면 앱과 갈리고, 갈린 채로도 HTTP 200이 온다`
  );
  assert.ok(
    /redirect_to=\$\{encodeURIComponent\(EMAIL_CONFIRM_REDIRECT\)\}/.test(sc),
    `${SCRIPT}가 redirect_to에 그 상수를 안 싣는다`
  );
  /*
    ⚠ **본문이 아니라 쿼리에 실어야 한다.** GoTrue는 본문의 redirect_to를 무시하고
      Site URL로 떨어진다 — 역시 오류가 안 난다.
  */
  assert.ok(
    !/body:[\s\S]{0,200}redirect_to/.test(sc),
    `${SCRIPT}가 redirect_to를 본문에 넣는다 — GoTrue가 무시하고 Site URL로 떨어진다`
  );
}

console.log('authredirect ✓ auth 호출이 돌아올 주소를 명시하고 · 앱과 스크립트가 같은 상수를 쓴다');
