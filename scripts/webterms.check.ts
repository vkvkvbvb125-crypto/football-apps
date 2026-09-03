/*
  앱 안 약관과 웹에 공개된 약관이 같은가.

  ── 왜 필요한가 ────────────────────────────────────────────────────
  둘은 `src/features/auth/terms.ts` **한 파일**에서 나온다. 앱은 그 배열을 직접
  읽고, 웹은 `build-web-terms.mjs`가 뽑아 `web/` 에 넣은 HTML을 올린다.

  그래서 **terms.ts를 고치고 빌더를 안 돌리면 둘이 갈린다.** 앱은 새 문장으로
  동의를 받는데 공개된 문서는 옛 문장이다. 그건 단순한 불일치가 아니라
  「동의받은 내용과 공개된 내용이 다르다」이고, 약관에서는 분쟁거리다.

  2026-09-03에 실제로 잠깐 그 상태였다 — 보유 기간 문구를 고치고 빌더를 돌리기
  전까지. 그때는 알아채서 바로 돌렸지만, 알아채는 것에 기대는 것이 이 검사가 없는
  상태다. 빌더 머리말이 경계하던 바로 그 실패를 붙드는 것이 아무것도 없었다.

  ── 어떻게 보나 ────────────────────────────────────────────────────
  빌더의 `render()`를 불러 **메모리에서 다시 뽑고** `web/` 의 파일과 글자 그대로
  비교한다. 다르면 실패하고 처방을 찍는다.

  ⚠ **검사가 자기 사본을 시험하지 않게** 빌더에서 render()를 가져온다. 조립 코드를
    여기 한 벌 더 두면 둘이 갈리는 날 검사는 통과하는데 배포본은 옛 문장이 된다 —
    이 저장소에서 그 모양을 셋 걷어낸 적이 있다(score·timerring·upcoming).

  ⚠ **이 검사는 배포된 사이트를 보지 않는다.** `web/` 이 최신인지까지만 본다.
    거기서 Cloudflare Pages로 올리는 것은 사람이 한다. 「올렸는가」를 여기서
    묻는 척하면 그게 항상 참인 단언이 된다(anchor.ts 「단언을 넣기 전에」).
*/
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/*
  ⚠ 본문을 async 함수로 감싼다. tsx가 .ts를 CJS로 바꿔서 top-level await가 안 된다
    (빌더는 .mjs라 ESM이고 거기서는 된다). 검사 파일 확장자를 바꾸면 checks.mjs가
    수집하는 규칙(*.check.ts)에서 빠지므로 이쪽을 맞춘다.
*/
async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, '..');

  /* 윈도우 경로("C:\...")를 그대로 import()에 넘기면 'c:'를 프로토콜로 읽어 실패한다 */
  const { render } = await import(pathToFileURL(join(root, 'scripts/build-web-terms.mjs')).href);

  const expected: Record<string, string> = render();
  const paths = Object.keys(expected);

  /*
    ⚠ 「하나도 안 나왔다」와 「전부 같다」를 가른다. render()가 빈 객체를 돌려주면
      아래 루프가 한 번도 안 돌고 조용히 통과한다 — 이 세션에서 그 모양으로
      통과한 검사가 둘 있었다(deadcode의 tsc 미실행, devchain의 없는 곳 뒤지기).
  */
  assert.ok(paths.length >= 7, `render()가 ${paths.length}개만 냈다 — 약관 다섯 + terms + delete-account가 나와야 한다`);

  const stale: string[] = [];
  const missing: string[] = [];

  for (const rel of paths) {
    const abs = join(root, rel);
    if (!existsSync(abs)) {
      missing.push(rel);
      continue;
    }
    /* 줄바꿈을 맞춘다 — 체크아웃 설정에 따라 CRLF로 떨어질 수 있고, 그건 내용 차이가 아니다 */
    const onDisk = readFileSync(abs, 'utf8').split('\r\n').join('\n');
    const fresh = expected[rel].split('\r\n').join('\n');
    if (onDisk !== fresh) stale.push(rel);
  }

  if (missing.length || stale.length) {
    const lines = ['  x 앱 안 약관과 web/ 의 공개 문서가 다르다.'];
    if (missing.length) lines.push(`    없는 파일 — ${missing.join(', ')}`);
    if (stale.length) lines.push(`    낡은 파일 — ${stale.join(', ')}`);
    lines.push('');
    lines.push('    terms.ts를 고치고 웹을 다시 안 뽑은 것이다. 이대로 두면 앱은 새 문장으로');
    lines.push('    동의를 받는데 공개된 문서는 옛 문장이 된다.');
    lines.push('');
    lines.push('      node scripts/build-web-terms.mjs');
    lines.push('');
    lines.push('    그다음 web/ 을 Cloudflare Pages에 올린다 — 배포까지 해야 갈린 것이 맞춰진다.');
    console.error(lines.join('\n'));
    process.exit(1);
  }

  console.log(`webterms ok (${paths.length}개 문서가 terms.ts와 같다)`);
}

main();
