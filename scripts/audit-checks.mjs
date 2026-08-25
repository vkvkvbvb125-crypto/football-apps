// scripts/audit-checks.mjs — 검사들이 실제로 무언가를 보고 있는가
//
// 두 가지 고장이 똑같이 쓸모없다:
//   항상 통과하는 검사   무엇을 망가뜨려도 안 잡는다
//   항상 실패하는 검사   무엇을 넣어도 「잡음」이 나와서 변이 시험이 통째로 헛돈다
//
// 둘 다 겪었다. leaveteam.check가 CRLF 때문에 가드를 못 찾아 항상 실패했고, 그 상태로
// 변이 3개를 돌려 전부 「잡음」이라고 보고할 뻔했다. memberrow.check의 「같은 창을 쓰는가」는
// 파일 어딘가에 그 호출이 있기만 하면 통과해서, 한쪽 창만 바꾼 변이가 새어 나갔다.
//
// 여기서 보는 것:
//   1. 지금 통과하는가            — 통과 못 하면 「항상 실패」다
//   2. 읽는 소스를 비우면 실패하는가 — 그래도 통과하면 그 검사는 소스를 안 보고 있다
//
// ⚠ 이 스크립트는 소스 파일을 잠깐 비웠다가 되돌린다. 그래서 평소 검사 묶음에 넣지 않고
//   손으로 돌린다. 중간에 죽으면 파일이 빈 채로 남을 수 있다 — 그때는 git으로 되돌린다.
//
// ── 왜 부정 단언(!/x/)은 여기서 자동으로 검사하지 않는가 ──────────────
//
// 부정 단언은 패턴이 절대 매치될 수 없어도 통과한다. 그래서 「그 패턴을 만족하는 문자열을
// 넣으면 실패하는가」를 봐야 하는데, 자동화해 보니 38개 중 22개가 「판정 불가」로 남았다:
//
//   12개  전방부정·중첩 대안이 섞여 패턴에서 매치 문자열을 역생성하지 못했다
//   10개  파일 전체가 아니라 슬라이스나 런타임 값을 본다(between, call, message, body…).
//         파일 끝에 주입하면 그 구간에 닿지 않아 「죽은 단언」으로 잘못 나온다 —
//         실제로 9건을 죽었다고 결론냈다가 주입 위치가 틀렸음을 찾아 뒤집었다
//
// 판정 불가가 22건 남는 도구는 신호가 아니라 소음이다. 돌릴 때마다 사람이 그걸 훑어야 하고,
// 몇 번 지나면 아무도 안 본다. 그러면 「감사 도구가 있다」는 사실만 남아 오히려 안심 신호가
// 된다 — CRLF 때와 같은 구조다.
//
// 그래서 저작 시점의 규칙으로 대신한다:
//
//   ▸ 새 부정 정규식 단언(!/x/)을 쓸 때는, 그 패턴을 만족하는 문자열을 **그 단언이 실제로
//     보는 범위**(파일 전체든 슬라이스든) 안에 주입해 검사가 실패하는 것을 확인한 뒤에만
//     커밋한다.
//   ▸ 확인하지 못하면 부정 단언을 쓰지 말고 긍정 단언이나 값 비교로 바꿔 쓴다.
//
// 아래 파일 단위 감사는 판정이 이분법이라 판정 불가가 없다 — 그래서 이건 상시로 돌린다.
//
// 쓰는 법:  node scripts/audit-checks.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname, basename } from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SCRIPTS = join(ROOT, 'scripts');

const run = (script) => {
  try {
    execFileSync('npx', ['tsx', join(SCRIPTS, script)], { cwd: ROOT, stdio: 'pipe', shell: true });
    return true;
  } catch {
    return false;
  }
};

/** 검사가 읽는 소스 파일 — read('…') 과 new URL('../…') 두 가지 꼴을 본다 */
function sourcesOf(script) {
  const s = readFileSync(join(SCRIPTS, script), 'utf8');
  const found = new Set();
  for (const m of s.matchAll(/read\('([^']+)'\)/g)) found.add(m[1]);
  for (const m of s.matchAll(/new URL\('\.\.\/([^']+)'/g)) found.add(m[1]);
  return [...found].filter((f) => /\.(ts|tsx|json|sql)$/.test(f) && existsSync(join(ROOT, f)));
}

const checks = readdirSync(SCRIPTS).filter((f) => f.endsWith('.check.ts')).sort();
const problems = [];

for (const c of checks) {
  if (!run(c)) {
    problems.push(`${c}: 지금 통과하지 못한다 — 항상 실패하는 검사는 변이 시험을 무의미하게 만든다`);
    continue;
  }

  const sources = sourcesOf(c);
  if (sources.length === 0) continue; // 순수 함수만 보는 검사 — 비울 대상이 없다

  const backup = new Map();
  let stillPasses;
  try {
    for (const f of sources) {
      const p = join(ROOT, f);
      backup.set(p, readFileSync(p));
      writeFileSync(p, '');
    }
    stillPasses = run(c);
  } finally {
    for (const [p, b] of backup) writeFileSync(p, b);
  }

  if (stillPasses) {
    problems.push(`${c}: 읽는 소스(${sources.map(basename).join(', ')})를 비워도 통과한다 — 아무것도 안 보고 있다`);
  }
}

if (problems.length) {
  console.error('검사 자기 점검 실패:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`audit-checks ok — ${checks.length}개 검사가 통과하고, 소스를 비우면 모두 실패한다`);
