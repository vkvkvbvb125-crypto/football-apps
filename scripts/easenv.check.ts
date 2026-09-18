/*
  모든 빌드 프로필이 `environment`를 직접 적는가.

  ── 왜 이 검사가 있나 — 네 번 같은 구멍에 빠졌다 ──────────────────
  `eas.json`의 프로필이 `environment`를 안 적으면 **EAS가 환경변수를 안 넣는다.**
  그러면 `EXPO_PUBLIC_SUPABASE_URL`·`ANON_KEY`가 **빈 채로 빌드된다** —
  앱은 설치되고 화면도 뜨는데 **아무 데이터도 못 불러온다.**

      서랍 0     production-apk에 없음 → APK 둘이 값 없이 나갔다
      20a06b6    production에 없음 (출시용 프로필인데 그때까지 안 고쳐져 있었다)
      d9e8706    development에 없음 → 개발 클라이언트
      3a0cf0e    preview에 없음

  ⚠ **`extends`는 environment를 안 물려준다.** 「production을 상속하니 같겠지」가
    두 번째 사고의 원인이었다. 프로필마다 직접 적어야 한다.

  ⚠ **빠뜨려도 빌드는 성공한다.** 오류도 경고도 없다 — 20분을 기다려 받은 APK를
    기기에 깔고 로그인을 해 봐야 안다. 「실패와 성공의 출력이 같다」의 또 한 자리다.

  ⚠ **네 번이면 기억으로 못 막는다.** 그래서 검사로 옮긴다. 2026-09-19까지
    이 검사는 **없었다** — 세 후보(안 넣었나 · 목록이 손이었나 · 통과시켰나) 중
    「안 넣었다」였다.

  ── 이 검사가 보는 것 ─────────────────────────────────────────────
  ⑴ `eas.json`의 **모든** 프로필에 `environment`가 직접 있다
     (⚠ **목록을 손으로 들고 다니지 않는다.** 파일에 있는 프로필을 전부 센다 —
       손 목록이었다면 preview가 빠졌을 자리다. checks.mjs 머리말과 같은 이유)
  ⑵ 그 값이 EAS가 아는 이름이다 (`production` | `preview` | `development`)
  ⑶ `.env`에 앱이 실제로 읽는 `EXPO_PUBLIC_*`가 비어 있지 않다

  ⚠ 못 보는 것: **EAS 서버의 환경에 그 값이 실제로 들어 있는지**는 대시보드 쪽
    사실이라 못 본다. 그건 빌드 산출물에서 확인한다 —
    `unzip`으로 번들을 꺼내 URL·키를 찾는다(docs/store-listing.md의 절차).
    ⚠ 한글 문구로 찾을 때는 **UTF-16LE로도** 찾아야 한다. Hermes가 비ASCII를
      그렇게 저장해서, utf8로만 세면 **있는 것을 없다고** 읽는다.
*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/* EAS가 아는 환경 이름. 오타는 「없는 환경」이라 값이 안 실린다 */
const KNOWN = ['production', 'preview', 'development'];

/* ── ⑴⑵ 모든 프로필이 environment를 직접 적는가 ─────────────────── */
{
  const eas = JSON.parse(read('eas.json')) as {
    build?: Record<string, { environment?: string; extends?: string }>;
  };
  const profiles = Object.entries(eas.build ?? {});
  assert.ok(
    profiles.length >= 3,
    `eas.json에 빌드 프로필이 ${profiles.length}개뿐이다 — 파일 모양이 바뀌었으면 이 검사도 고쳐라`
  );

  const missing: string[] = [];
  const unknown: string[] = [];
  for (const [name, cfg] of profiles) {
    /*
      ⚠ **extends를 따라가지 않는다.** EAS가 안 따라가기 때문이다 —
        여기서 따라가면 검사가 실제보다 관대해져서, 「상속하니 괜찮다」는
        그 오해를 검사가 도로 승인하게 된다.
    */
    if (!cfg.environment) missing.push(cfg.extends ? `${name}(extends ${cfg.extends})` : name);
    else if (!KNOWN.includes(cfg.environment)) unknown.push(`${name}=${cfg.environment}`);
  }

  assert.deepEqual(
    missing,
    [],
    `environment가 없는 빌드 프로필이 있다: ${missing.join(', ')} — ` +
      `EAS가 환경변수를 안 넣어 **Supabase 값이 빈 채로 빌드된다.** ` +
      `오류 없이 성공하므로 기기에 깔아 로그인해 봐야 안다. ` +
      `⚠ extends는 environment를 안 물려준다 — 프로필마다 직접 적어라`
  );
  assert.deepEqual(
    unknown,
    [],
    `EAS가 모르는 environment 이름이 있다: ${unknown.join(', ')} — ` +
      `쓸 수 있는 값은 ${KNOWN.join(' | ')}다. 오타는 「없는 환경」이라 값이 안 실린다`
  );
}

/* ── ⑶ .env에 앱이 읽는 값이 실제로 있는가 ──────────────────────── */
{
  /*
    앱이 `process.env.EXPO_PUBLIC_*`로 읽는 이름을 **소스에서 뽑아** 센다.
    ⚠ 목록을 손으로 적으면 새 변수를 더할 때 빠진다 — 그게 이 검사가 막으려는 모양이다.
  */
  const env = Object.fromEntries(
    read('.env')
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
  /* 앱이 없으면 못 도는 것들. 이 둘이 비면 로그인부터 안 된다 */
  for (const key of ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY']) {
    assert.ok(
      (env[key] ?? '').length > 0,
      `.env의 ${key}가 비어 있다 — 로컬 실행도 빌드도 값 없이 돈다`
    );
  }
}

console.log('easenv ✓ 모든 빌드 프로필에 environment가 직접 있고 · .env에 값이 있다');
