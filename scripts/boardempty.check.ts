/*
  「글이 없다」를 두 화면이 같은 말로 하는가.

  ── 왜 필요한가 ────────────────────────────────────────────────────
  게시판(BoardPanel)과 팀 홈(TeamHomeTab)이 같은 상태를 다르게 말하고 있었다:

      BoardPanel    첫 글을 남겨보세요
      TeamHomeTab   아직 게시글이 없어요

  같은 앱 안에서 같은 사실이 두 말로 나오면, 읽는 사람은 **다른 상태인 줄 안다** —
  「게시글이 없는」 것과 「글을 남길 수 있는」 것이 다른 화면의 다른 이야기로 읽힌다.
  이 저장소에서 여러 번 잡은 「한쪽만 고쳐서 갈린다」의 문구 판이다.

  ── 어느 쪽이 기준인가 ─────────────────────────────────────────────
  **BoardPanel이다.** 그 화면이 글을 쓰는 자리라 문구가 곧 다음 할 일이 된다.
  팀 홈은 요약이라 「저기로 가세요」를 하는 자리이고, 그 요약이 원본과 다른 말을
  하면 안 된다. 그래서 팀 홈이 게시판을 따라간다.

  ⚠ 이 검사는 **문구가 같은가**만 본다. 「이 문구가 좋은가」는 안 묻는다 —
    바꾸고 싶으면 BoardPanel에서 바꾸고, 그러면 이 검사가 팀 홈을 가리킨다.
*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* CRLF를 정규화한다 — 안 하면 개행이 든 정규식이 못 찾고 항상 실패한다 */
const read = (p: string) => readFileSync(p, 'utf8').split('\r').join('');

const board = read('src/features/board/components/BoardPanel.tsx');
const teamHome = read('src/features/team/components/TeamHomeTab.tsx');

/*
  BoardPanel의 기준 문구를 **코드에서 뽑는다.** 여기 문자열로 적어 두면
  셋이 갈릴 수 있는 자리가 된다(검사가 자기 사본을 갖는 모양이다).
  분류 필터가 걸렸을 때와 아닐 때가 삼항으로 갈리고, 기준은 필터가 없을 때다.
*/
const m = board.match(/filter \? '[^']*' : '([^']*)'/);
assert.ok(m, 'BoardPanel의 빈 상태 삼항을 못 찾았다 — 모양이 바뀌었으면 이 검사도 고쳐라');
const canonical = m![1];

assert.ok(
  canonical.length >= 4,
  `기준 문구가 너무 짧다(${JSON.stringify(canonical)}) — 엉뚱한 것을 집었을 수 있다`
);

/* 팀 홈의 게시글 빈 상태 — nextEmpty 한 줄이다 */
const found = [...teamHome.matchAll(/<Text style=\{styles\.nextEmpty\}>([^<]*)<\/Text>/g)].map(
  (x) => x[1].trim()
);
assert.ok(found.length > 0, 'TeamHomeTab에서 nextEmpty 빈 상태를 못 찾았다');

assert.ok(
  found.includes(canonical),
  [
    `게시글 빈 상태 문구가 갈렸다.`,
    `    기준(BoardPanel) — ${JSON.stringify(canonical)}`,
    `    팀 홈에 있는 것  — ${found.map((f) => JSON.stringify(f)).join(', ')}`,
    ``,
    `    같은 사실을 두 화면이 다르게 말하면 읽는 사람은 다른 상태인 줄 안다.`,
    `    바꾸고 싶으면 BoardPanel에서 바꾸고 팀 홈을 거기 맞춰라.`,
  ].join('\n')
);

console.log(`boardempty ok (기준 「${canonical}」 · 팀 홈이 따라간다)`);
