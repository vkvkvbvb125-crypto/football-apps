/*
  아바타 글자가 **첫 글자를 떼지 않는가.**

  ── 왜 이 검사가 있나 ──────────────────────────────────────────────
  `name.slice(1)`은 **한글 이름에서 성을 떼는** 규칙이다(「김범준」 → 「범준」).
  로마자에 그대로 돌면 **첫 글자를 잃는다** — 「Reviewer」가 「eviewer」가 되고,
  원형 칸을 넘쳐 화면에는 「eview / er」로 두 줄에 잘려 보인다.
  ⚠ 하필 **Play 심사 계정 이름이 정확히 `Reviewer`**다.

  ⚠ **이 검사는 두 번째 놓침 때문에 생겼다.** 2026-09-19에 세 자리를 고쳤는데
    (`1e03755`) **`TeamSettingsScreen`의 실력 레벨 목록을 빠뜨렸다.** 새 빌드를
    기기에 깔고 나서야 그 화면에서 그대로 「eview / er」를 봤다.
    같은 모양이 여섯 자리에 흩어져 있어 **눈으로 훑는 방식이 안 통한다.**

  ── 이 검사가 보는 것 ─────────────────────────────────────────────
  `<Text style={styles.avatarText}>` 안에서 `.slice(1)`을 쓰지 않는가.

  ⚠ `.slice(0, 1)`·`.slice(0, 2)`는 **막지 않는다.** 앞에서 자르는 것이라 첫 글자를
    잃지 않는다. 막는 것은 **앞을 떼는 것** 하나다.
  ⚠ 자리마다 규칙을 통일하지도 않는다 — 큰 칸과 겹침 줄은 목적이 다르다(서랍 4).
    여기서 붙드는 것은 **첫 글자 상실**뿐이다.
*/
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const walk = (d: string, out: string[] = []): string[] => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) {
      if (!p.includes('__tests__')) walk(p, out);
    } else if (/\.tsx$/.test(n)) out.push(p);
  }
  return out;
};

const files = walk('src');
assert.ok(files.length > 50, `src를 못 훑었다(${files.length}개) — 경로가 바뀌었나`);

const bad: string[] = [];
let sites = 0;
for (const file of files) {
  const src = readFileSync(file, 'utf8').split('\r').join('');
  for (const m of src.matchAll(/<Text style=\{styles\.avatarText\}>\{([^}]*)\}<\/Text>/g)) {
    sites += 1;
    if (/\.slice\(\s*1\s*\)/.test(m[1])) {
      const line = src.slice(0, m.index ?? 0).split('\n').length;
      bad.push(`${file.split(sep).join('/')}:${line}  «${m[1].trim()}»`);
    }
  }
}

assert.ok(sites >= 5, `아바타 글자 자리를 ${sites}개밖에 못 찾았다 — 모양이 바뀌었으면 이 검사도 고쳐라`);
assert.deepEqual(
  bad,
  [],
  `아바타가 이름의 **첫 글자를 뗀다** — 「Reviewer」가 「eviewer」가 된다. ` +
    `성을 떼는 것은 한글 이름 규칙이라 로마자에 쓰면 안 된다. ` +
    `initialOf(…)를 써라(team/initials.ts):\n  ${bad.join('\n  ')}`
);

console.log(`avatarname ✓ 아바타 글자 ${sites}곳: 첫 글자를 떼는 곳이 없다`);
