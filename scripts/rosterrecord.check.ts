/*
  지나간 경기의 명단에 **독촉·투표 UI를 안 그리는가.**

  ── 왜 이 검사가 있나 ──────────────────────────────────────────────
  2026-09-19에 기기에서 **끝난 9/10 경기**의 참석 명단에 이렇게 떠 있었다:

      미투표 1명 독촉
      참석 여부 응답하기
      종료된 경기예요          ← 바로 아래에 같이

  **끝난 경기에 투표를 권하고 독촉을 제안한다.** 아래에 「종료됐다」고 적어 두고서다.

  ⚠ `isLocked`로는 못 가른다. 그건 **「지금 못 바꾼다」**(마감·종료)이고,
    이건 **「바꿀 이유가 없다」**다 — 마감만 지난 예정 경기에서는 총무가 독촉할 수
    있어야 하므로 두 판정은 다르다.

  ── 이 검사가 보는 것 ─────────────────────────────────────────────
  ⑴ RosterSheet의 독촉·내 응답 블록이 `!isRecord`로 막힌다
  ⑵ **판정을 시트가 새로 만들지 않는다** — 호출자가 `isMatchRecord(…)`로 계산해 넘긴다.
     명단을 예정/완료로 가르는 그 함수와 **같은 기준**이라야 한 경기가 한 시트 안에서
     두 뜻이 되지 않는다.
  ⑶ RosterSheet를 부르는 **모든** 자리가 넘긴다 (하나만 이으면 화면마다 다르게 동작한다)
*/
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').split('\r').join('');

/* ── ⑴⑵ 시트가 막는가 · 판정을 스스로 만들지 않는가 ─────────────── */
{
  const sheet = read('src/features/attendance/components/RosterSheet.tsx');

  assert.ok(
    /\{!isRecord && isAdmin && counts\.pending > 0 && !!onPokeAll && \(/.test(sheet),
    'RosterSheet의 일괄 독촉이 !isRecord로 안 막힌다 — 끝난 경기에서 안 온 사람을 ' +
      '이제 와서 부르게 된다'
  );
  assert.ok(
    /\{!isRecord && !!onVote && \(/.test(sheet),
    'RosterSheet의 내 응답 블록이 !isRecord로 안 막힌다 — 끝난 경기의 참석 여부를 ' +
      '지금 고르게 된다'
  );
  /*
    ⚠ **주석이 아니라 코드를 본다.** 처음에 `!/isMatchRecord/`로 썼더니
      이 프롭을 설명하는 **내 주석**이 걸려서 FAIL이 났다. 같은 실수를 세 번째 밟았다
      (scripts/lib/anchor.ts 「근거 주석이 앵커를 품는다」).
      import은 주석에 안 적히므로 이쪽이 겨냥이 정확하다.
  */
  assert.ok(
    !/^\s*import[^;]*isMatchRecord/m.test(sheet),
    'RosterSheet가 isMatchRecord를 import한다 — 판정은 호출자가 넘긴다(isLocked와 같은 규약). ' +
      '시트가 따로 계산하면 명단을 가르는 기준과 갈릴 수 있다'
  );
}

/* ── ⑶ 부르는 자리가 전부 넘기는가 ─────────────────────────────── */
{
  const walk = (d: string, out: string[] = []): string[] => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) {
        if (!p.includes('__tests__')) walk(p, out);
      } else if (/\.tsx$/.test(n)) out.push(p);
    }
    return out;
  };

  const callers: string[] = [];
  const missing: string[] = [];
  for (const file of walk('src')) {
    const src = readFileSync(file, 'utf8').split('\r').join('');
    let at = src.indexOf('<RosterSheet');
    while (at !== -1) {
      callers.push(file.split(sep).join('/'));
      /* 이 태그가 끝나는 곳까지만 본다 — 다음 `/>` */
      const end = src.indexOf('/>', at);
      const tag = src.slice(at, end === -1 ? src.length : end);
      if (!/isRecord=\{[^}]*isMatchRecord\(/.test(tag)) {
        missing.push(`${file.split(sep).join('/')} (${at})`);
      }
      at = src.indexOf('<RosterSheet', at + 1);
    }
  }

  assert.ok(callers.length >= 2, `RosterSheet를 부르는 곳을 ${callers.length}개밖에 못 찾았다 — 이 검사도 고쳐라`);
  assert.deepEqual(
    missing,
    [],
    `RosterSheet에 isRecord={isMatchRecord(…)}를 안 넘기는 곳이 있다 — 한쪽만 이으면 ` +
      `같은 시트가 화면마다 다르게 동작한다:\n  ${missing.join('\n  ')}`
  );
}

console.log('rosterrecord ✓ 끝난 경기에는 독촉·응답을 안 그린다 · 판정은 호출자가 isMatchRecord로 넘긴다');
