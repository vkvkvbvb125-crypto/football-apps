/*
  집계가 **나간 사람의 투표**를 세지 않는가.

  ── 왜 이 검사가 있나 ──────────────────────────────────────────────
  2026-09-19에 **같은 화면에 한 경기의 숫자가 둘**로 나왔다. Demo FC의 9/25
  예정 경기에서 kdtest3가 팀을 나간 뒤:

      홈 카드      참석 1 / 정원 12명 · 참석 1 · 미정 0 · 불참 0
      명단 시트    전체 1 · 참석 0 · 불참 0 · 미투표 1

  참석 명단(`rosterMembers`)은 **예정이면 현재 멤버만** 돌도록 고쳐져 있었는데,
  `resolveCapacity`를 부르는 세 자리는 `match.votes`를 **원본 그대로** 넘겼다.
  소프트 삭제로 바꿀 때 명단만 고치고 집계를 안 따라 고친 것이다.

  ⚠ **둘 다 그럴듯해서 눈으로는 안 갈린다.** 「참석 1」과 「참석 0」이 한 화면에
    같이 떠 있어야 보인다. 실제로 그 스크린샷을 찍고서야 알았다.

  ⚠ **오류가 안 난다.** 나간 사람이 없는 팀에서는 두 값이 같다 — 시험 계정으로
    만든 팀에서는 영원히 안 보인다.

  ── 이 검사가 보는 것 ─────────────────────────────────────────────
  `resolveCapacity(` 의 **첫 인자**가 `countableVotes(`로 시작하는가.
  아니면 FAIL — 원본 votes를 넘긴 것이다.

  ⚠ 못 보는 것: `countableVotes`에 **틀린 activeIds**를 넘기는 것. 그건 타입이
    같아서 여기서 못 가른다. 집합의 출처는 `members`(team_members_active 뷰)여야
    하고, 그건 `memberview.check.ts`가 다른 각도에서 붙든다.
*/
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const walk = (d: string, out: string[] = []): string[] => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) {
      if (!p.includes('__tests__')) walk(p, out);
    } else if (/\.tsx?$/.test(n)) out.push(p);
  }
  return out;
};

const files = walk('src');
assert.ok(files.length > 50, `src를 못 훑었다(${files.length}개) — 경로가 바뀌었나`);

const bad: string[] = [];
let calls = 0;

for (const file of files) {
  /* 정의 파일 자신은 건너뛴다 — 거기 있는 것은 호출이 아니라 선언이다 */
  if (file.endsWith(`utils${sep}capacity.ts`)) continue;
  const src = readFileSync(file, 'utf8');

  for (let at = src.indexOf('resolveCapacity('); at !== -1; at = src.indexOf('resolveCapacity(', at + 1)) {
    /* import 줄의 이름은 호출이 아니다 */
    const lineStart = src.lastIndexOf('\n', at) + 1;
    const line = src.slice(lineStart, src.indexOf('\n', at));
    if (/^\s*import\s/.test(line)) continue;

    calls += 1;
    /* 여는 괄호 뒤의 첫 토큰. 줄바꿈·공백을 건너뛴다 */
    const rest = src.slice(at + 'resolveCapacity('.length).replace(/^[\s\r\n]+/, '');
    if (!rest.startsWith('countableVotes(')) {
      const lineNo = src.slice(0, at).split('\n').length;
      bad.push(`${file.split(sep).join('/')}:${lineNo}  첫 인자가 «${rest.slice(0, 40).split('\n')[0]}»`);
    }
  }
}

assert.ok(calls >= 3, `resolveCapacity 호출을 ${calls}개밖에 못 찾았다 — 이름이 바뀌었으면 이 검사도 고쳐라`);
assert.deepEqual(
  bad,
  [],
  `resolveCapacity에 원본 votes를 넘기는 곳이 있다 — 나간 사람의 투표가 집계에 섞여 ` +
    `같은 경기에 홈과 명단 시트가 **다른 숫자**를 낸다. ` +
    `countableVotes(match, activeIds)로 감싸라:\n  ${bad.join('\n  ')}`
);

console.log(`votecount ✓ resolveCapacity 호출 ${calls}곳 전부 countableVotes를 거친다`);
