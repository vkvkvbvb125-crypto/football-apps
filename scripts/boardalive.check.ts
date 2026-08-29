// scripts/board.check.ts — 게시판이 살아 있는가
//
// 화면에서만 걷어냈다가 되살렸다. 걷어낼 때 「코드와 DB는 그대로 둔다 — 되살릴 때
// 마이그레이션부터 다시 보게 되면 비용이 훨씬 크다」고 적어 뒀고, 그 판단이 값을 했다:
// 되살리는 데 든 것이 TeamBoardTab의 주석 두 줄이다.
//
// 그래서 여기서 붙드는 것은 「다시 조용히 꺼지지 않는가」다. 한 번 꺼졌을 때 진입로가
// 없어져서 화면이 안 그려졌고, 그 사실이 어디에도 안 남았다.
//
//   1. 탭이 실제로 그려지는가 (return null로 돌아가지 않는가)
//   2. 진입로가 있는가 (없으면 코드가 살아 있어도 못 본다)
//   3. 카드가 좁은 조회를 쓰는가 (전체 조회로 돌아가면 왕복이 다섯이 된다)
//   4. 제목 자리를 문자열로 자르지 않는가
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onlyMatch } from './lib/anchor.ts';

// CRLF를 정규화한다 — 안 하면 개행이 든 정규식이 못 찾고 항상 실패한다
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').split('\r').join('');
const boardTab = read('src/features/team/components/TeamBoardTab.tsx');
const tab = read('src/features/team/components/TeamHomeTab.tsx');
const screen = read('src/features/team/screens/TeamHomeScreen.tsx');
const service = read('src/features/board/services/boardService.ts');

// ── 1. 탭이 그려진다 ────────────────────────────────────────────────
//
// 꺼져 있던 시절의 모양은 「import가 주석 · return null」이었다. 코드가 다 있는 채로
// 아무것도 안 그리므로, 타입 검사도 린터도 아무 말을 안 한다.
{
  const codeOnly = boardTab.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(/import \{ BoardPanel \}/.test(codeOnly), 'BoardPanel import가 다시 주석이 됐다');
  assert.ok(/return <BoardPanel/.test(codeOnly), 'TeamBoardTab이 아무것도 안 그린다');
  assert.ok(!/return null;/.test(codeOnly), 'TeamBoardTab이 null을 돌려준다 — 꺼진 상태다');

  // props 셋을 그대로 넘긴다 — 하나라도 빠지면 BoardPanel이 자기 팀을 모른다
  for (const prop of ['teamId={teamId}', 'myUserId={myUserId}', 'isAdmin={isAdmin}']) {
    assert.ok(codeOnly.includes(prop), `BoardPanel에 ${prop}을 안 넘긴다`);
  }
  assert.ok(/tab === 'board'/.test(screen), '팀 화면이 board 탭을 안 그린다');
}

// ── 2. 진입로가 있다 ────────────────────────────────────────────────
//
// 이게 한 번 사라져서 게시판이 통째로 안 보였다. 「코드가 살아 있다」와 「사용자가
// 갈 수 있다」는 다르다 — 둘이 갈렸을 때 아무 검사도 안 걸렸다.
{
  const tiles = onlyMatch(tab, /const TILES: [\s\S]*?\n\];/, 'TILES 정의');
  assert.ok(/key: 'board'/.test(tiles), '하단 버튼에 게시판이 없다');
  // 카드의 「전체보기」도 같은 곳으로 간다
  assert.ok(/accessibilityLabel="게시글 전체보기"/.test(tab), '최근 게시글 카드에 전체보기가 없다');
  const entries = tab.split("onGoTile('board')").length - 1;
  assert.ok(entries >= 2, `board로 가는 길이 ${entries}개다 — 카드 제목과 글 줄 둘 이상이어야 한다`);
}

// ── 3. 카드는 좁은 조회를 쓴다 ──────────────────────────────────────
//
// 팀 홈이 원래 fetchPosts를 부르고 있었다. 게시판을 걷어낸 뒤에도 그 호출이 남아서
// 왕복 다섯(posts + likes + comments + profiles + pins)을 쓰고 2개만 저장한 뒤
// 아무 데도 안 그렸다. 카드가 생기면서 그 자리를 좁은 조회가 대신한다.
{
  assert.ok(/fetchRecentPosts/.test(screen), '팀 홈이 좁은 조회를 안 쓴다');
  assert.ok(!/fetchPosts\(/.test(screen), '팀 홈이 다시 전체 조회를 부른다 — 왕복이 다섯이 된다');

  // 좁은 조회가 실제로 좁은가 — 좋아요·고정을 같이 읽으면 좁은 게 아니다
  const fn = onlyMatch(service, /export async function fetchRecentPosts[\s\S]*?\n\}/, 'fetchRecentPosts');
  assert.ok(!/post_likes|post_pins/.test(fn), '좁은 조회가 좋아요·고정까지 읽는다');
  assert.ok(/post_comments/.test(fn), '댓글 수를 안 읽는다 — 카드가 그린다');
  // 작성자 이름은 부르는 쪽이 넘긴다. profiles를 또 읽으면 왕복이 하나 더 든다
  assert.ok(!/from\('profiles'\)/.test(fn), '좁은 조회가 profiles를 또 읽는다');
}

// ── 4. 제목 자리를 문자열로 안 자른다 ───────────────────────────────
//
// posts에 title이 없어서 body 첫 줄이 제목 자리다. 줄 단위까지만 자르고 길이는
// numberOfLines로 말줄임에 맡긴다 — 문자열을 직접 자르면 글자 폭이 기기마다 달라
// 어떤 화면에서는 여백이 남고 어떤 화면에서는 여전히 넘친다.
{
  const fn = onlyMatch(service, /export async function fetchRecentPosts[\s\S]*?\n\}/, 'fetchRecentPosts');
  const code = fn.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  /* 개행 이스케이프를 단언에 쓰지 않는다 — 정규식으로 쓰면 
이 실제 개행을 찾고,
     문자열로 쓰면 이스케이프를 몇 겹 겹쳐야 하는지가 파일을 거칠 때마다 달라진다.
     「무엇으로 자르는가」가 아니라 「줄 단위로 자르고 [0]을 쓰는가」를 본다 */
  assert.ok(/\.split\([^)]+\)\[0\]/.test(code), '첫 줄을 안 집는다');
  assert.ok(!/slice\(0, \d+\)/.test(code), '제목을 문자열 길이로 자른다 — 기기마다 결과가 다르다');
  assert.ok(/numberOfLines=\{1\}/.test(onlyMatch(tab, /<Text style=\{styles\.postTitle\}[^>]*>/, '제목 Text')),
    '제목이 한 줄로 안 잘린다');
}

console.log('board ok');
