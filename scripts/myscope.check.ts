/*
  「내 것」을 가져온다는 조회가 실제로 나로 좁히는가.

  ── 왜 이 검사가 있나 ──────────────────────────────────────────────
  `fetchMyMemberships`가 조건 없이 `team_members`를 전부 읽고 있었다.

      .from('team_members').select('*').order('joined_at')     ← user_id가 없다

  RLS(`team_members_select`)가 `is_team_member(team_id)`라 **팀 단위**로 열려 있다.
  그래서 「내 멤버십」을 달라는 조회가 **내가 속한 팀의 모든 멤버 행**을 돌려줬다.

  ⚠ **혼자인 팀에서는 1개라 정상으로 보인다. 팀원이 늘면서 조용히 깨진다.**
    2026-09-15에 6명 팀에서 쟀다 — DB의 내 멤버십은 1인데 스토어는 6이었다.
    그러면 activeTeam이 **남의 행**으로 잡힐 수 있고, membershipId가 남의 것이면
    role이 뒤집히고(총무↔팀원) 정산 「내 몫」·미납·독촉 대상이 전부 남의 값이 된다.
    화면에 오류가 없고 숫자가 그럴듯해서 아무도 못 알아챈다.

  ── 이 검사가 보는 것 ─────────────────────────────────────────────
  ① 이름이 「내 ~」인 조회는 user_id(또는 그에 준하는 것)로 좁힌다
  ② 어떤 select든 **필터가 하나도 없으면** 실패한다 — RLS가 팀 단위라
     「전부 달라」는 곧 「남의 것까지 달라」다

  ⚠ 못 보는 것: 필터가 **맞는** 컬럼인지까지는 안 본다. `.eq('team_id', …)`만 있고
    user_id가 필요한 자리는 ①의 이름 규칙으로만 걸린다. 이름이 「my」가 아닌
    「내 것」 조회가 생기면 이 검사는 조용하다 — 그때는 이 목록에 손으로 넣어라.
*/
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(p, 'utf8').split('\r').join('');
const strip = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(String.fromCharCode(10))
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join(String.fromCharCode(10));

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return p.includes('__tests__') ? [] : walk(p);
    return p.endsWith('.ts') ? [p] : [];
  });

const files = walk('src').filter((f) => !f.includes(join('dev', 'screenshotFixtures')));

/*
  `.from('x').select(...)` 한 덩어리를 뗀다. 뒤따르는 체인(.eq/.in/…)까지 같이 본다.
  ⚠ 다음 문장이 시작되면 멈춘다 — 안 그러면 아래 줄의 필터를 이 조회 것으로 센다.
*/
const CHAIN = /\.from\('(\w+)'\)\s*\.select\(([\s\S]{0,600}?)(?=;\n|\n\s*if |\n\s*const |\n\s*return )/g;

const unfiltered: string[] = [];
const myWithoutUser: string[] = [];

for (const file of files) {
  const src = strip(read(file));
  for (const m of src.matchAll(CHAIN)) {
    const tail = m[2];
    const filters = [...tail.matchAll(/\.(eq|in|is|neq|match|filter|or)\('([^']+)'/g)];
    const line = src.slice(0, m.index).split(String.fromCharCode(10)).length;
    const at = `${file.split(/[\\/]/).join('/')}:${line}`;

    /* ② 필터가 하나도 없다 — RLS가 팀 단위라 「전부」는 「남의 것까지」다 */
    if (filters.length === 0) unfiltered.push(`${at} (${m[1]})`);

    /* ① 「내 ~」인데 user_id로 안 좁힌다 */
    const fnAt = src.lastIndexOf('export async function', m.index);
    const fnName = fnAt >= 0 ? (src.slice(fnAt, m.index).match(/function\s+(\w+)/)?.[1] ?? '') : '';
    const isMine = /^fetchMy|^loadMy|My[A-Z]/.test(fnName);
    const byUser = filters.some(([, , col]) => col === 'user_id' || col === 'id');
    if (isMine && !byUser) myWithoutUser.push(`${at} ${fnName}`);
  }
}

assert.deepEqual(
  unfiltered,
  [],
  `필터가 하나도 없는 조회가 있다: ${unfiltered.join(', ')}\n` +
    `  → RLS는 팀 단위로 열려 있다. 「전부 달라」는 「남의 것까지 달라」다.\n` +
    `  → 무엇으로 좁히는지 한 줄 붙여라(user_id · team_id · match_id …).`
);

assert.deepEqual(
  myWithoutUser,
  [],
  `「내 ~」라는 이름인데 user_id로 안 좁힌다: ${myWithoutUser.join(', ')}\n` +
    `  → RLS가 팀 단위라 팀원 전원이 돌아온다. 혼자일 때만 맞는 것처럼 보인다.`
);

/* 고친 그 자리를 이름으로 못 박는다 — 이 검사가 실제로 무엇을 지키는지 남긴다 */
const team = strip(read('src/features/team/services/teamService.ts'));
assert.ok(
  /fetchMyMemberships[\s\S]{0,400}?\.eq\('user_id', userId\)/.test(team),
  'fetchMyMemberships가 user_id로 안 좁힌다 — 팀원 전원이 내 소속으로 잡힌다'
);
assert.ok(
  /export async function fetchMyMemberships\(userId: string\)/.test(team),
  'fetchMyMemberships가 userId를 인자로 안 받는다 — 서비스는 스토어를 보지 않는다'
);

console.log(`myscope ✓ 조회 전부가 좁혀져 있다 (${files.length}개 파일)`);
