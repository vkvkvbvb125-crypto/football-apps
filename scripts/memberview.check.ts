/*
  현재 멤버를 **뷰 한 곳**에서만 읽는가.

  ── 왜 이 검사가 있나 ──────────────────────────────────────────────
  `team_members`에는 나간 사람의 행이 `left_at`을 달고 **남아 있다**. 행을 지우지 않는
  이유는 CASCADE다 — settlement_shares·attendance_votes·team_assignments·poll_responses·
  waitlist가 `team_member_id`를 `ON DELETE CASCADE`로 물고 있어서, 지우면 **그 사람의
  정산 몫과 참석 기록이 함께 사라진다**(2026-09-18 스키마 확인).

  그래서 조회는 전부 `team_members_active` 뷰를 타야 한다.

  ⚠ **「`left_at is null`을 붙이자」는 규율로 두면 빠뜨린다.** 빠뜨린 화면에만 탈퇴자가
    남고, 그건 **화면을 열어 봐야만** 보인다 — 오류도 경고도 안 난다.
    조건이 코드에 흩어지면 그중 하나가 틀려도 나머지가 맞아서 정상으로 보인다.
    뷰는 DB에 정의가 하나뿐이라 빠뜨릴 자리가 없다. 이 검사는 **그 통로를 강제한다.**

  ── 이 검사가 보는 것 ─────────────────────────────────────────────
  ⑴ `from('team_members')`로 **조회**하는 곳이 없다 — memberNameService.ts만 예외
  ⑴-b 그 예외 파일이 **id·user_id 말고 다른 칸을 안 읽는다**
  ⑵ 뷰 이름이 상수 하나에서 온다 — 문자열을 여기저기 적지 않는다
  ⑶ 본인 탈퇴가 `leave_team` RPC를 쓴다 — `.delete()`로 하면 조용히 실패한다

  ⚠ **쓰기는 테이블로 가는 것이 맞다.** 뷰가 `security_invoker=true`라 UPDATE/DELETE가
    안 가고, 총무의 강퇴·역할 변경은 테이블 정책(team_members_update_admin /
    _delete_admin)이 막는 자리다. 그래서 ⑴은 **조회만** 본다.

  ── ⚠ 예외가 하나 있다 — 그리고 그 예외도 잠가 둔다 ──────────────
  「현재 멤버가 누구인가」와 「이 id의 이름이 무엇인가」는 **다른 질문**이다.
  정산 몫·참석 투표·팀 분배는 나간 뒤에도 남아서, 이름을 뷰에서 찾으면 못 찾고
  폴백 「멤버」가 뜬다 — 2026-09-18에 정산 상세에서 실제로 그렇게 보였다.
  **합계는 멀쩡했다.** 금액은 남고 사람만 지워진 모양이라 더 나빴다.

  그래서 `memberNameService.ts` **하나만** team_members 전체를 본다.
  ⚠ **「이름 해석용은 예외」로 열면 안 된다** — 이름만 바꿔 붙이면 뭐든 통과한다.
    파일 하나를 화이트리스트로 잡고, **그 안에서도 이름 외의 칸을 읽으면 FAIL**이다.
    거기서 role·skill_tag를 읽기 시작하면 「나간 사람이 포함된 멤버 목록」이 되어
    멤버 수·권한·분배가 오염된다 — 그 파일을 만든 이유의 정반대다.

  ⚠ 못 보는 것: 뷰가 DB에 실제로 있는지, `security_invoker`가 켜져 있는지는 **대시보드
    쪽 사실**이라 못 본다. 없으면 조회가 404로 죽으므로 조용히 틀리지는 않는다.
*/
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { bodyFrom } from './lib/anchor.ts';

const root = new URL('../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), 'utf8').split('\r').join('');
const strip = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(String.fromCharCode(10))
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1'))
    .join(String.fromCharCode(10));

/* src 전체를 훑는다 — 목록을 손으로 들고 다니지 않는다(checks.mjs 머리말) */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(new URL(dir, root))) {
    const rel = `${dir}${name}`;
    if (statSync(new URL(rel, root)).isDirectory()) walk(`${rel}/`, out);
    else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}
const FILES = walk('src/');
assert.ok(FILES.length > 50, `src를 못 훑었다(${FILES.length}개) — 경로가 바뀌었나`);

const SERVICE = 'src/features/team/services/teamService.ts';
/*
  team_members 전체를 봐도 되는 **유일한** 파일. 다른 파일은 뷰를 쓴다.
  ⚠ 파일을 늘리려면 왜 뷰로 안 되는지 여기 적어라 — 목록이 길어지는 순간
    「예외가 규칙」이 되고, 그러면 이 검사가 아무것도 안 지킨다.
*/
const NAME_SERVICE = 'src/features/team/services/memberNameService.ts';
/* 그 파일이 읽어도 되는 칸. 이름을 붙이는 데 필요한 둘뿐이다 */
const NAME_COLUMNS = ['id', 'user_id'];

/* ── ⑴ team_members를 직접 조회하는 곳이 없다 ────────────────────── */
{
  const offenders: string[] = [];
  for (const f of FILES) {
    if (f === NAME_SERVICE) continue; // ⑴-b가 따로 본다
    const src = strip(read(f));
    /*
      `from('team_members')` 뒤에 `.select(`가 오는 것만 잡는다.
      `.update(`나 `.delete()`가 먼저 오면 쓰기라 넘어간다.

      ⚠ **전에는 뒤 300자를 봤다.** 체인이 길어지면 `.select(`가 창 밖으로 밀려
        **쓰기로 오인해 넘어간다** — 조용히 놓치는 방향이다.
        **문장 경계(`;`)까지** 자른다(2026-09-29 훑기).
    */
    const re = /\.from\('team_members'\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const semi = src.indexOf(';', m.index);
      const after = src.slice(m.index, semi < 0 ? src.length : semi);
      const sel = after.indexOf('.select(');
      const wr = Math.min(
        ...[after.indexOf('.update('), after.indexOf('.delete('), after.indexOf('.insert(')]
          .filter((i) => i >= 0)
          .concat([Number.MAX_SAFE_INTEGER])
      );
      if (sel >= 0 && sel < wr) {
        const line = src.slice(0, m.index).split(String.fromCharCode(10)).length;
        offenders.push(`${f}:${line}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `team_members를 직접 조회한다 — 나간 사람(left_at)이 섞여 들어온다. ` +
      `ACTIVE_MEMBERS(team_members_active 뷰)를 써라: ${offenders.join(', ')}`
  );
}

/* ── ⑴-b 예외 파일이 이름만 읽는가 ───────────────────────────────── */
{
  const src = strip(read(NAME_SERVICE));
  /*
    ⚠ **전에는 첫 match만 봤다.** 이 파일에 `from('team_members')`가 둘이 되는 날
      앞의 것만 보고 통과한다 — 뒤에서 role·skill_tag를 읽어도 모른다.
      `onlyIndexOf`로 **앵커가 하나임을 먼저 못 박고**, 거기서 문장 끝까지 자른다.
  */
  const selBody = bodyFrom(src, ".from('team_members')", `${NAME_SERVICE}의 조회`, [';']);
  const sel = /\.select\('([^']*)'\)/.exec(selBody);
  assert.ok(sel, `${NAME_SERVICE}가 team_members를 select하지 않는다 — 이 파일의 존재 이유다`);
  const cols = sel[1].split(',').map((c) => c.trim()).filter(Boolean);
  const extra = cols.filter((c) => !NAME_COLUMNS.includes(c));
  assert.deepEqual(
    extra,
    [],
    `${NAME_SERVICE}가 이름 해석에 필요 없는 칸을 읽는다: ${extra.join(', ')} — ` +
      `여기서 role·skill_tag를 읽으면 「나간 사람이 포함된 멤버 목록」이 되어 ` +
      `멤버 수·권한·분배가 오염된다. 그건 이 파일을 만든 이유의 정반대다`
  );
  /*
    ⚠ `select('*')`는 위 검사를 통과해 버린다 — 쪼개면 `['*']`이고 그건 NAME_COLUMNS에
      없으니 잡히긴 하지만, 메시지가 엉뚱해지므로 따로 말한다.
  */
  assert.ok(!cols.includes('*'), `${NAME_SERVICE}가 select('*')를 쓴다 — 칸을 명시해라`);

  /* 그 파일이 멤버 목록처럼 쓰이지 않는가 — 역할·실력을 내보내면 안 된다 */
  for (const bad of ['role', 'skill_tag', 'skillTag', 'jersey_number']) {
    /*
      ⚠ **템플릿 리터럴 안에서 `\b`는 단어 경계가 아니라 백스페이스 문자(U+0008)다.**
      처음에 new RegExp(`\b${bad}\b`)로 썼더니 정규식이 `role`이 되어
      **절대 안 맞았다** — 변이(예외 파일이 skillTag를 내보낸다)가 그대로 통과했다.
      2026-09-18에 변이 시험에서 잡았다. 통과만 보고 넘겼으면 못 봤을 자리다.
      템플릿에 정규식을 적을 때는 \\b로 쓰거나, 여기처럼 일반 문자열로 만든다.
  */
    assert.ok(
      !new RegExp('\\b' + bad + '\\b').test(src),
      `${NAME_SERVICE}에 ${bad}가 나온다 — 이 파일은 id → 이름만 돌려준다`
    );
  }
}

/* ── ⑵ 뷰 이름이 상수 하나에서 온다 ──────────────────────────────── */
{
  const svc = strip(read(SERVICE));
  assert.ok(
    /export const ACTIVE_MEMBERS = 'team_members_active';/.test(svc),
    `${SERVICE}에 ACTIVE_MEMBERS 상수가 없다 — 뷰 이름이 흩어지면 하나만 고쳐도 갈린다`
  );
  /* 상수 정의 말고 문자열을 직접 적은 곳 */
  const hard: string[] = [];
  for (const f of FILES) {
    const src = strip(read(f));
    for (const line of src.split(String.fromCharCode(10))) {
      if (!line.includes("'team_members_active'")) continue;
      if (line.includes('export const ACTIVE_MEMBERS')) continue;
      hard.push(`${f}: ${line.trim().slice(0, 60)}`);
    }
  }
  assert.deepEqual(hard, [], `뷰 이름을 문자열로 직접 적었다 — ACTIVE_MEMBERS를 써라: ${hard.join(' | ')}`);
}

/* ── ⑶ 본인 탈퇴가 RPC를 쓴다 ────────────────────────────────────── */
{
  const svc = strip(read(SERVICE));
  assert.ok(
    /supabase\.rpc\('leave_team'/.test(svc),
    `${SERVICE}에 leave_team RPC 호출이 없다 — 본인 탈퇴를 DELETE로 하면 ` +
      `RLS(team_members_delete_admin)에 막혀 **200에 0행**으로 조용히 실패한다`
  );

  const store = strip(read('src/features/team/stores/teamStore.ts'));
  const from = store.indexOf('leaveTeam: async');
  assert.ok(from > 0, 'teamStore의 leaveTeam을 못 찾았다 — 이름이 바뀌었으면 이 검사도 고쳐라');
  /*
    ⚠ **끝 앵커는 `from` 뒤에 실제로 오는 것이어야 한다.** 처음에 다음 액션 이름을
      `updateHomeLocation`으로 잡았는데 그건 파일에서 **leaveTeam보다 앞**이라
      indexOf가 -1을 냈고, slice(from, -1)이 **파일 끝까지** 잘려서 총무 강퇴
      코드(removeMemberRequest)까지 본문에 들어왔다 — 「조용히 실패한다」로 오판했다.
      2026-09-18에 이 검사를 처음 돌리자마자 걸렸다(anchor.ts 「부정 단언을 쓸 때」).
      다음 액션을 이름으로 잡지 말고 **들여쓰기 2칸의 다음 키**를 찾는다.
  */
  const nextKey = store.slice(from + 1).search(new RegExp('\\n  [a-zA-Z][A-Za-z0-9_]*: '));
  assert.ok(nextKey > 0, 'leaveTeam 다음 액션을 못 찾았다 — 스토어 모양이 바뀌었나');
  const body = store.slice(from, from + 1 + nextKey);
  assert.ok(
    /leaveTeamRequest\(/.test(body),
    'teamStore.leaveTeam이 leaveTeamRequest를 안 부른다 — 본인 탈퇴가 RPC를 안 탄다'
  );
  assert.ok(
    !/removeMemberRequest\(/.test(body),
    'teamStore.leaveTeam이 아직 removeMemberRequest(DELETE)를 부른다 — 조용히 실패한다'
  );
  /*
    ⚠ **여기서 try/catch를 두면 안 된다.** 화면(TeamSettingsScreen)이 `.catch`로 받아
      「나갈 수 없어요」를 띄운다. 스토어가 삼키면 **마지막 총무 거절이 화면에 안 뜬다** —
      2026-09-18 전까지 이 경로는 한 번도 안 열렸다(오류가 아예 안 왔다).
  */
  assert.ok(
    !/try\s*\{/.test(body),
    'teamStore.leaveTeam이 오류를 삼킨다 — 화면이 받아야 「마지막 총무는…」이 뜬다'
  );
}

console.log('memberview ✓ 조회는 뷰 하나로 · 본인 탈퇴는 RPC로 · 오류가 화면까지 간다');
