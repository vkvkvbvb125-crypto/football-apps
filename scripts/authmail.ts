/*
  scripts/authmail.ts — 시험용 인증 메일을 **앱과 똑같은 redirect로** 보낸다.

  ── 왜 있나 ────────────────────────────────────────────────────────
  2026-09-18에 kdtest3의 확인 메일을 `curl`로 `/auth/v1/resend`에 직접 쏘면서
  **`redirect_to`를 안 넘겼다.** Supabase는 조용히 **Site URL**로 떨어지고,
  그 값이 `kickday://auth-callback`이라 데스크톱에서 **흰 화면**이 떴다.
  계정 확인 자체는 됐는데(email_confirmed_at 찍힘) 사용자 눈에는 실패였다.

  ⚠ **앱은 제대로 넘기고 있었다.** 깨진 것은 내가 앱 경로를 우회한 쪽이다 —
    `expo install`을 우회했다가 버전 고정을 흘린 것과 **같은 축**이다
    (`scripts/lib/anchor.ts` 「우회한 명령」). 같은 날 두 번 밟았다.

  그래서 시험용 발송은 **이 스크립트로만 한다.** curl로 직접 쏘지 마라.
  이 파일은 앱이 쓰는 상수를 **그대로 import**하므로 값이 갈릴 수 없다.

  ── 쓰는 법 ────────────────────────────────────────────────────────
      npx tsx scripts/authmail.ts confirm <email>     가입 확인 메일 재발송
      npx tsx scripts/authmail.ts reset   <email>     비밀번호 재설정 메일

  ⚠ **재발송하면 앞 링크가 죽는다.** 사용자가 아직 안 눌렀으면 그 링크를 무효로
    만든다 — 2026-09-17에 kdtest2에서 실제로 그렇게 깨뜨렸다. 보내기 전에 물어라.
  ⚠ 링크 수명은 **1시간**이다(실측: 발송 1시간 뒤 클릭 → 만료). 사람이 바로 누를
    수 있을 때 보내라.
  ⚠ 판정은 **Resend의 Emails 로그 `Delivered`**다. 여기 찍히는 `HTTP 200`은
    「요청이 접수됐다」까지지 발송 근거가 아니다.
*/
import { readFileSync } from 'node:fs';
import { EMAIL_CONFIRM_REDIRECT, PASSWORD_RESET_REDIRECT } from '../src/features/auth/authRedirects.ts';

const [, , kind, email] = process.argv;
const KINDS = ['confirm', 'reset'] as const;
type Kind = (typeof KINDS)[number];

if (!email || !KINDS.includes(kind as Kind)) {
  console.error('쓰는 법: npx tsx scripts/authmail.ts <confirm|reset> <email>');
  process.exit(2);
}

/* .env에서 읽는다 — 키를 인자로 받으면 셸 기록에 남는다 */
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('.env에서 EXPO_PUBLIC_SUPABASE_URL / ANON_KEY를 못 읽었다');
  process.exit(1);
}


async function main() {
  const isConfirm = kind === 'confirm';
  const endpoint = isConfirm ? '/auth/v1/resend' : '/auth/v1/recover';
  const body = isConfirm ? { type: 'signup', email } : { email };

  /*
    ⚠ **redirect_to는 쿼리 파라미터다.** 본문에 넣으면 GoTrue가 무시하고
      Site URL로 떨어진다 — 오류가 안 나므로 **성공한 것처럼 보인다.**
    ⚠ **둘 다 넘긴다.** 2026-09-19에 재설정도 https 착지 페이지가 생겼다
      (web/auth/reset). 앱과 같은 상수를 쓰므로 값이 갈릴 수 없다 —
      이 스크립트를 만든 이유가 그것이다.
  */
  const redirect = isConfirm ? EMAIL_CONFIRM_REDIRECT : PASSWORD_RESET_REDIRECT;
  const qs = `?redirect_to=${encodeURIComponent(redirect)}`;
  const target = `${url}${endpoint}${qs}`;

  console.log(`보낸다: ${kind} → ${email}`);
  console.log(`  endpoint   ${target}`);
  console.log(`  redirect   ${redirect}`);
  console.log(`  보낸 시각  ${new Date().toISOString()}  (링크 수명 1시간)`);

  const res = await fetch(target, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`  HTTP ${res.status}  ${text || '{}'}`);

  if (!isConfirm) {
    console.log('  ⚠ 재설정 링크는 **폰에서** 눌러야 끝난다 — 새 비밀번호 화면이 앱 안에 있다.');
    console.log('    데스크톱에서 열면 착지 페이지가 「휴대폰에서 열어주세요」를 띄운다(흰 화면은 아니다).');
  }
  console.log('  ⚠ 발송 판정은 Resend의 Emails 로그 Delivered다. 위 HTTP 200은 근거가 아니다.');

  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
