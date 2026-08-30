/*
  로그아웃은 사용자가 누른 것이 되어야 한다.

  이 검사가 생긴 이유. authService.signOut이 `if (error) throw error`였다.
  부르는 자리 넷(TabHeader · MySettings 둘 · TeamStartScreen)이 전부 await도
  .catch()도 없어서, 그 throw는 그대로 unhandled rejection이 됐다.

  ⚠ 그런데 재보니 앞서 적었던 진단이 틀렸다. supabase-js는 서버 무효화에
  실패해도 로컬 세션을 먼저 지우고(GoTrueClient._signOut → removeCurrentSession)
  _notifyAllSubscribers('SIGNED_OUT', null)까지 쏜 뒤에 오류를 돌려준다.
  즉 「눌렀는데 로그인 상태로 남는다」가 아니었다 — 로그아웃은 되고 있었고,
  안 된 것은 다른 기기의 세션을 끊는 일이었으며, 그 사실을 아무도 몰랐다.

  그래서 이 검사가 지키는 것은 둘이다:
    ① 던지지 않는다 (부르는 자리가 넷이고 아무도 안 잡는다)
    ② 서버가 실패해도 로컬은 지우고, 못 한 것은 사용자에게 말한다
*/
import { readFileSync } from 'node:fs';

const SVC = 'src/features/auth/services/authService.ts';
const STORE = 'src/features/auth/stores/authStore.ts';
const LOGIN = 'src/features/auth/screens/LoginScreen.tsx';

const strip = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const svc = strip(readFileSync(SVC, 'utf8'));
const store = strip(readFileSync(STORE, 'utf8'));
const login = strip(readFileSync(LOGIN, 'utf8'));

const fails: string[] = [];
const ok = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };

/** signOut 함수 본문만 떼어낸다 — 파일 전체를 보면 다른 함수의 throw가 섞인다. */
const signOutBody = (() => {
  const at = svc.indexOf('export async function signOut(');
  if (at < 0) return '';
  /*
    서명 줄의 마지막 { 부터 센다. svc.indexOf('{', at)로 시작하면
    Promise<{ serverRevoked: boolean }> 의 중괄호에 걸려 본문이 잘린다 —
    실제로 걸렸다. 반환 타입에 객체 리터럴이 있으면 첫 {는 본문이 아니다.
  */
  const NL = String.fromCharCode(10); // 이스케이프를 안 쓴다 — 셸을 두 번 지나면 샌다
  const sigEnd = svc.indexOf(NL, at);
  const bodyStart = svc.lastIndexOf('{', sigEnd);
  if (bodyStart < 0) return '';
  let depth = 0;
  for (let i = bodyStart; i < svc.length; i += 1) {
    if (svc[i] === '{') depth += 1;
    else if (svc[i] === '}') {
      depth -= 1;
      if (depth === 0) return svc.slice(at, i + 1);
    }
  }
  return '';
})();

// ── ① 던지지 않는다 ──
ok(signOutBody !== '', 'signOut 본문을 못 찾았다');
ok(!/\bthrow\b/.test(signOutBody),
   'signOut이 던진다 — 부르는 자리 넷이 아무도 안 잡아서 그대로 unhandled rejection이 된다');
ok(/serverRevoked/.test(signOutBody), '결과를 값으로 안 돌려준다');

// ── ② 서버가 실패해도 로컬은 지운다 ──
//    「사용자가 누른 것은 되어야 한다」가 이 줄이다.
ok(/scope: 'local'/.test(signOutBody),
   "서버 실패 뒤 scope: 'local' 폴백이 없다 — 로컬에서 할 수 있는 것을 안 한다");
ok(signOutBody.indexOf("scope: 'local'") > signOutBody.indexOf('await supabase.auth.signOut()'),
   '로컬 폴백이 서버 시도보다 앞에 있다 — 순서가 뒤집혔다');

// ── ③ 못 한 것을 사용자에게 말한다 ──
ok(/const \{ serverRevoked \} = await signOutService\(\)/.test(store),
   '스토어가 결과를 안 읽는다 — 읽지 않으면 값으로 돌려준 의미가 없다');
ok(/if \(!serverRevoked\)/.test(store), '서버 무효화 실패를 스토어가 안 가른다');
ok(store.includes('다른 기기의 로그인은 그대로예요'), '무엇이 안 됐는지 말하는 문구가 없다');
//   그 문구가 실제로 그려지는 자리가 있어야 한다. 없으면 set은 은폐다.
ok(/useAuthStore\(\(s\) => s\.error\)/.test(login) && /\{!!error &&/.test(login),
   '로그인 화면이 authStore.error를 안 그린다 — 로그아웃 뒤 그 문구를 볼 자리가 없다');

// ── ④ 릴리스에서 원인을 알 방법 ──
const warns = signOutBody.match(/console\.warn\([^,)]*/g) ?? [];
ok(warns.length >= 3, 'console.warn이 세 자리(서버 실패·요청 실패·로컬 실패)보다 적다');
ok(warns.every((w) => w.includes('[auth]')),
   'console.warn 중 [auth] 표지가 없는 것이 있다: ' + warns.filter((w) => !w.includes('[auth]')).join(' | '));

// ── ⑤ 계정 삭제는 이 규칙을 따르지 않는다 ──
//    거기는 로컬만 지우면 안 된다. 서버가 실패하면 실패로 끝나야 한다.
const acct = strip(readFileSync('src/features/settings/services/accountService.ts', 'utf8'));
/*
  창(N자)으로 보지 않는다. 이 파일에는 `if (error) throw error`가 둘이고
  (fetchDeletionStatus·deleteAccount), 창으로 보면 옆 함수의 throw가 대신
  걸린다 — 변이 시험에서 실제로 걸렸다. 본문을 떼어서 본다.
*/
const deleteBody = (() => {
  const at = acct.indexOf('export async function deleteAccount(');
  if (at < 0) return '';
  const NL = String.fromCharCode(10);
  const bodyStart = acct.lastIndexOf('{', acct.indexOf(NL, at));
  if (bodyStart < 0) return '';
  let depth = 0;
  for (let i = bodyStart; i < acct.length; i += 1) {
    if (acct[i] === '{') depth += 1;
    else if (acct[i] === '}') {
      depth -= 1;
      if (depth === 0) return acct.slice(bodyStart, i + 1);
    }
  }
  return '';
})();
ok(deleteBody !== '', 'deleteAccount 본문을 못 찾았다');
ok(/if \(error\) throw error/.test(deleteBody),
   'deleteAccount가 오류를 안 던진다 — 계정이 안 지워졌는데 지워진 것처럼 끝난다');

if (fails.length) {
  console.error(fails.map((f) => '  ✗ ' + f).join('\n'));
  process.exit(1);
}
