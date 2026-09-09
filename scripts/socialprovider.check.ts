/*
  화면에 있는 소셜 로그인 버튼이 실제로 되는 것뿐인가.

  ── 왜 필요한가 ────────────────────────────────────────────────────
  이 저장소가 하루에 넷을 잡은 계열이다 — 「있는데 아무 일도 안 나는」 자리.
  독촉 버튼(핸들러가 안 넘어옴) · remindNotVoted(아무도 안 부름) ·
  홈의 송금 시트(열 수 없음) · handleShare(부르는 자리 없음).

  애플 로그인이 다섯째가 될 뻔했다. 버튼은 있는데 Supabase에서 provider가 꺼져 있어
  누르면 「Unsupported provider」가 뜬다. 앱 코드는 멀쩡하다 — 그래서 tsc도
  다른 검사도 아무 말을 안 한다.

  ── 무엇을 보나 ────────────────────────────────────────────────────
  플래그와 목록을 마주 보게 한다. 플래그가 꺼졌는데 버튼이 목록에 그대로 있으면 실패.

  ⚠ **이 검사는 Supabase를 부르지 않는다.** 네트워크를 타는 검사는 오프라인에서
    「못 물어봤다」와 「꺼져 있다」가 같은 실패가 되고, 그건 이 저장소가 여러 번
    데인 모양이다. 대신 **플래그가 사람이 잰 결과를 적어 두는 자리**이고,
    이 검사는 그 값과 화면이 어긋나지 않는지만 본다.
    provider를 실제로 켠 뒤에는 플래그를 true로 바꾸는 것이 사람의 몫이다.
*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* CRLF를 정규화한다 — 안 하면 개행이 든 정규식이 못 찾고 항상 실패한다 */
const read = (p: string) => readFileSync(p, 'utf8').split('\r').join('');
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const login = read('src/features/auth/screens/LoginScreen.tsx');
const code = strip(login);

/* ── 1. 플래그가 있고, 값을 읽을 수 있다 ── */
const m = code.match(/const APPLE_LOGIN_ENABLED = (true|false);/);
assert.ok(m, 'APPLE_LOGIN_ENABLED를 못 찾았다 — 이름이 바뀌었으면 이 검사도 고쳐라');
const enabled = m![1] === 'true';

/* ── 2. 목록에 애플이 들어가는 자리가 플래그에 물려 있다 ── */
//
// ⚠ 「'apple'이라는 글자가 있는가」를 묻지 않는다. 주석에 남아 있어야 하고,
//   SocialProvider 타입에도 있다(iOS에서 되살릴 것이라 타입에서 빼지 않았다).
//   묻는 것은 **배열에 무조건 들어가는가**다.
const arr = code.slice(code.indexOf('}[] = ['), code.indexOf('];', code.indexOf('}[] = [')));
assert.ok(arr.length > 0, 'SOCIALS 배열을 못 찾았다');

const unconditional = /\{\s*key:\s*'apple'/.test(arr);
const gated = /APPLE_LOGIN_ENABLED[\s\S]{0,120}key:\s*'apple'/.test(arr);

if (!enabled) {
  assert.ok(
    !unconditional || gated,
    'APPLE_LOGIN_ENABLED가 false인데 애플 버튼이 조건 없이 목록에 있다 — 누르면 실패한다'
  );
  assert.ok(gated, '애플 항목이 플래그에 안 물려 있다 — 플래그를 켜도 버튼이 안 나오거나 그 반대가 된다');
}

/* ── 3. 처리방침이 앱과 같은 제공사를 적는다 ── */
//
// 안 쓰는 제공사를 적으면 「거기서 정보를 제공받는다」가 거짓이 된다.
// 반대로 되살리고 방침을 안 고치면 고지 없이 받는 것이 된다 — 양쪽 다 본다.
{
  const terms = strip(read('src/features/auth/terms.ts'));
  const mentions = /카카오·네이버·구글·애플/.test(terms);
  assert.equal(
    mentions,
    enabled,
    enabled
      ? '애플 로그인을 켰는데 처리방침의 소셜 제공사 목록에 애플이 없다'
      : '애플 로그인이 꺼져 있는데 처리방침이 애플에서 정보를 받는다고 적는다'
  );
}

console.log(`socialprovider ok (애플 ${enabled ? '켜짐' : '꺼짐'} · 화면·약관이 같다)`);
