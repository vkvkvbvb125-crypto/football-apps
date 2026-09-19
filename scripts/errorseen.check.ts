/*
  스토어가 `error`에 적은 것을 **사용자가 볼 수 있는가.**

  ── 왜 이 검사가 있나 ──────────────────────────────────────────────
  2026-09-19에 같은 모양을 **세 번** 겪었다:

    joinTeam            error에 적는데 그리는 곳이 TeamStartScreen뿐 —
                        새 경로(RootNavigator)는 그 화면을 안 지나 **무반응**이었다
    announcementsStore  error에 적는데 그리는 화면이 **하나도 없다**
    pollsStore          같음

  공지 작성이 실패해도 총무는 **올라간 줄 알았다.** 「같은 공지가 이미 있어요」처럼
  공들여 쓴 문구가 **한 번도 사람에게 안 갔다.**

  ⚠ **「상태를 세운다」와 「사용자가 본다」는 다른 일이다.** 앞쪽만 보는 검사는
    이걸 통과시킨다 — 실제로 `secondteam.check`가 ⑴~⑸을 다 통과시키고도 못 봤다.

  ── 어떻게 기계적으로 보나 ────────────────────────────────────────
  **사용자에게 닿는 길은 둘뿐이다:**

    ㉮ 그 스토어의 `error`를 **어느 화면이 구독해서 그린다**
    ㉯ 그 동작이 **던진다** — 부르는 쪽이 받아서 자기 자리에 그린다
       (`attendanceStore.vote`가 이 모양이다: `set({ error }); throw`)

  그래서 **스토어마다** 본다: `set({ error: … })`가 있는데 ㉮도 ㉯도 없으면 FAIL.

  ⚠ **못 보는 것 — 왜 완전하지 않은가.**
    · ㉮가 있어도 **부르는 화면이 그 화면이 아니면** 안 보인다. 그게 joinTeam이었다.
      「어느 화면이 어느 동작을 부르는가」는 정적으로 못 센다 — 훅을 통해 건네지고
      프롭으로 또 건네진다. **그건 사람이 훑어야 한다.**
    · ㉯가 있어도 **부르는 쪽이 catch를 비워 두면** 안 보인다.
    이 검사는 **「아무 길도 없는」 경우**만 막는다 — 가장 나쁜 경우이고,
    스토어가 하나 늘 때 자동으로 걸린다. 그게 이 검사를 만든 이유다.
*/
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const strip = (t: string) =>
  t
    .split('\r')
    .join('')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');

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
const screens = files.filter((f) => f.endsWith('.tsx')).map((f) => strip(readFileSync(f, 'utf8')));

/* ⚠ 윈도는 경로 구분자가 `\`다 — 정규식에 섞어 쓰지 말고 **먼저 정규화**한다.
     처음에 `[\/]`로 쓰다가 0개를 찾았다 */
const rel = (f: string) => f.split(sep).join('/');
const stores = files.filter((f) => /stores\/[a-zA-Z]+Store\.ts$/.test(rel(f)));
assert.ok(stores.length >= 5, `스토어를 ${stores.length}개밖에 못 찾았다 — 경로 규칙이 바뀌었나`);

const mute: string[] = [];
for (const file of stores) {
  const src = strip(readFileSync(file, 'utf8'));

  /* 값을 세우는 곳만 센다 — `error: null`(지우기)과 타입 선언은 아니다 */
  const sets = [...src.matchAll(/set\(\{[^}]*\berror:\s*(?!null)[^}]*\}/g)];
  if (sets.length === 0) continue;

  /* ㉯ 던지는가 */
  const throws = /\bthrow\s/.test(src);

  /* ㉮ 어느 화면이 이 스토어의 error를 읽는가 */
  const hook = /export const (use[A-Za-z]+) = create/.exec(src)?.[1];
  /*
    ⚠ **템플릿 리터럴에 정규식을 적지 마라.** 처음에 이렇게 썼다가 틀렸다:

        new RegExp(`${hook}\(...`)      ← 템플릿이 `\(`를 `(`로 먹어 버린다

    만들어진 정규식이 `useAuthStore((?:(w+) => w+.error…)`가 되어 **아무것도 못 찾고**,
    멀쩡한 스토어 셋(assignment·auth·score)을 위반으로 지목했다.
    `String.raw`를 쓰면 그 층이 없어진다 — 적은 그대로가 정규식이 된다.
  */
  const drawn =
    !!hook &&
    screens.some((s) => new RegExp(hook + String.raw`\((\(\w+\) => \w+\.error|[^)]*\)\.error)`).test(s));

  if (!throws && !drawn) {
    mute.push(`${rel(file)}  (error를 ${sets.length}곳에서 세운다)`);
  }
}

assert.deepEqual(
  mute,
  [],
  `스토어가 error에 적는데 **사용자에게 닿는 길이 없다** — 던지지도 않고, 그 error를 ` +
    `그리는 화면도 없다. 실패가 **아무 일도 안 일어난 것**처럼 보인다. ` +
    `attendanceStore처럼 \`set({ error }); throw\`로 바꾸고 부르는 쪽이 그리게 해라:\n  ` +
    mute.join('\n  ')
);

console.log(`errorseen ✓ 스토어 ${stores.length}개: error를 세우는 곳은 모두 던지거나 그려진다`);
