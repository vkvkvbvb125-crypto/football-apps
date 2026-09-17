/*
  팀 조회가 **안 끝날 수 있는 상태**로 돌아가지 않는가.

  ── 왜 이 검사가 있나 ──────────────────────────────────────────────
  `loadMemberships`가 안 돌아오면 앱이 `TeamLoading`에 갇힌다 — 글자도 탭바도
  뒤로가기도 없는 화면이다. RN의 fetch에는 기본 시한이 없어서, 멈춘 연결이나
  캡티브 포털이면 그대로 선다. **실패는 오히려 낫다**(catch가 받는다).
  나쁜 것은 **안 끝나는 것**이다.

  ⚠ 이 자리가 특별한 이유는 호출이 느려서가 아니라 **게이트가 있어서**다.
    같은 모양(시한 없는 supabase 호출)은 저장소에 73곳이 있지만, 그중
    **빠져나갈 수 없는 화면은 이 하나**다. 그래서 여기만 감쌌다.
    ⚠ 게이트가 늘면 그때 공용화를 다시 본다 — 세야 할 것은 호출 수가 아니라
      **빠져나갈 수 없는 화면 수**다.

  ── 이 검사가 보는 것 ─────────────────────────────────────────────
  ① 상한이 **상수로** 있고 loadMemberships 안에서 쓰인다
  ② 요청을 **실제로 끊는다** — AbortController를 만들어 서비스에 넘긴다
  ③ 끊긴 것과 실패한 것을 **다른 상태로** 보낸다(문구가 달라야 한다)
  ④ 그 상태를 **화면이 읽어서 그린다** — 값만 세우고 안 닿는 것을 막는다
  ⑤ 「다시 시도」가 loadMemberships를 **다시 부른다** — 상한이 그 안에 있어서
     재시도에도 다시 걸린다. 다른 걸 부르면 두 번째가 무한정 기다린다

  ⚠ 못 보는 것: **값이 적절한지**는 안 본다. 12초가 3초로 바뀌어도 통과한다.
    근거는 teamStore의 상수 주석에 있고, 그걸 지키는 것은 사람이다.
*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8').split('\r').join('');
const strip = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(String.fromCharCode(10))
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join(String.fromCharCode(10));

const STORE = 'src/features/team/stores/teamStore.ts';
const SERVICE = 'src/features/team/services/teamService.ts';
const NAV = 'src/navigation/RootNavigator.tsx';

const store = strip(read(STORE));
const service = strip(read(SERVICE));
const nav = strip(read(NAV));

/* loadMemberships 본문만 떼어 본다 — 다른 액션의 코드를 이 검사 것으로 세지 않게 */
const start = store.indexOf('loadMemberships: async');
assert.ok(start > 0, 'loadMemberships를 못 찾았다 — 이름이 바뀌었으면 이 검사도 고쳐라');
const end = store.indexOf('\n  setActiveTeam:', start);
assert.ok(end > start, 'loadMemberships의 끝을 못 찾았다 — 다음 액션 이름이 바뀌었나');
const body = store.slice(start, end);

// ── ① 상한이 상수로 있고 본문에서 쓰인다 ──────────────────────────
{
  assert.ok(
    /const TEAM_LOAD_TIMEOUT_MS = [\d_]+;/.test(store),
    'TEAM_LOAD_TIMEOUT_MS 상수가 없다 — 숫자를 인라인하면 근거 주석과 값이 갈린다'
  );
  assert.ok(
    /TEAM_LOAD_TIMEOUT_MS/.test(body),
    'loadMemberships가 TEAM_LOAD_TIMEOUT_MS를 안 쓴다 — 상한이 선언만 되고 안 걸렸다'
  );
  /*
    ⚠ 상수가 **있고** 본문이 그걸 **쓰는** 것을 따로 본다. 하나로 묶으면
      「선언은 있는데 안 쓴다」가 통과한다 — 이 저장소가 여러 번 본 모양이다.
  */
}

// ── ② 요청을 실제로 끊는다 ────────────────────────────────────────
{
  assert.ok(
    /new AbortController\(\)/.test(body),
    'loadMemberships가 AbortController를 안 만든다 — Promise.race는 요청을 안 끊는다'
  );
  assert.ok(
    /setTimeout\(\s*\(\)\s*=>\s*\w+\.abort\(\)/.test(body),
    '상한이 지나도 abort()를 안 부른다 — 컨트롤러만 만들고 안 쓴다'
  );
  assert.ok(
    /clearTimeout\(/.test(body),
    '타이머를 안 지운다 — 조회가 빨리 끝나도 타이머가 살아 남는다'
  );

  /* 신호가 서비스까지 내려가야 실제로 끊긴다. 스토어 안에서만 만들면 아무것도 안 끊는다 */
  assert.ok(
    /fetchMyMemberships\([^)]*\.signal\)/.test(body),
    'fetchMyMemberships에 signal을 안 넘긴다 — 컨트롤러가 요청에 안 닿는다'
  );

  /*
    ⚠ **요청이 둘이라 둘 다 걸어야 한다.** 순차라서 하나만 걸면 반쪽이다 —
      ①에서 매달리면 ②는 시작도 못 하고, ②에서 매달려도 전체가 안 끝난다.
  */
  const fn = service.slice(
    service.indexOf('export async function fetchMyMemberships'),
    service.indexOf('export async function', service.indexOf('export async function fetchMyMemberships') + 10)
  );
  const armed = (fn.match(/\.abortSignal\(/g) ?? []).length;
  assert.equal(
    armed,
    2,
    `fetchMyMemberships의 요청 ${armed}개에만 신호가 걸렸다 — team_members와 teams 둘 다여야 한다`
  );
}

// ── ③ 끊긴 것과 실패한 것이 다른 상태로 간다 ──────────────────────
{
  assert.ok(
    /signal\.aborted/.test(body),
    '중단인지 진짜 오류인지 안 가른다 — 중단도 catch로 오므로 err만 보면 둘이 같은 출력이 된다'
  );
  for (const kind of ["'timeout'", "'failed'"]) {
    assert.ok(
      new RegExp(`loadError: ${kind}`).test(body),
      `loadError에 ${kind} 갈래가 없다 — 「응답이 없어요」와 「불러오지 못했어요」는 다른 말이다`
    );
  }
  /*
    ⚠ 둘을 같은 값으로 합치면 위의 두 단언이 하나만 통과한다. 그게 잡는 자리다 —
      합치는 순간 문구를 가를 근거가 사라진다.
  */

  /*
    ⚠ **시작할 때 loadError를 지우면 안 된다. 성공했을 때만 지운다.**

      지우면 「다시 시도」를 누르는 순간 오류 화면이 사라지고, loaded는 이미 true인데
      activeTeam은 아직 null이라 **「팀 시작」 화면이 튀어나온다** — 팀이 있는 사람에게
      팀을 만들라고 권하는 그 화면이고, 이 갈래를 만든 이유가 그걸 막는 것이었다.
      2026-09-17에 기기에서 잡았다(기내 모드로 실패시킨 뒤 「다시 시도」).
      ⚠ 정적으로는 안 보였다 — 검사도 통과했고 코드도 읽어서 맞다고 봤다.
        「단언이 볼 수 없는 것」의 또 한 사례다.
  */
  const head = body.slice(0, body.indexOf('try {'));
  assert.ok(
    !/loadError:\s*null/.test(head),
    'loadMemberships가 시작하면서 loadError를 지운다 — 「다시 시도」가 「팀 시작」 화면을 노출한다'
  );
  assert.ok(
    /set\(\{[^}]*loaded: true, loadError: null \}\)/.test(body),
    '성공 경로에서 loadError를 안 지운다 — 한 번 실패하면 오류 화면에서 못 벗어난다'
  );
}

// ── ④ 그 상태가 화면에 닿는다 ─────────────────────────────────────
{
  /*
    ⚠ **RootNavigator 본문으로 좁혀서 본다. 파일 전체로 보면 죽은 단언이 된다.**
      TeamLoadErrorScreen도 같은 줄로 loadError를 읽는데(문구를 고르려고), 파일 전체를
      보면 **그 읽기가 네비게이터의 읽기를 대신 만족시킨다.**
      2026-09-16에 변이로 잡았다 — 네비게이터의 읽기를 지웠는데 검사가 통과했다.
      「단언이 죽어 있는 것」을 또 밟은 자리라 범위를 명시적으로 자른다.
  */
  const navBody = nav.slice(nav.indexOf('export function RootNavigator'));
  assert.ok(navBody.length > 0, 'RootNavigator 본문을 못 찾았다');
  assert.ok(
    /useTeamStore\(\(s\) => s\.loadError\)/.test(navBody),
    'RootNavigator가 loadError를 안 읽는다 — 값은 서는데 분기가 그걸 모른다'
  );
  assert.ok(
    /loadError \? \(/.test(nav),
    'RootNavigator가 loadError로 분기하지 않는다 — 읽기만 하고 안 쓴다'
  );

  /*
    ⚠ **activeTeam 판정보다 앞이어야 한다.** 못 불러온 것과 팀이 없는 것은 둘 다
      `memberships: []`라, 뒤에 두면 「팀 만들기」 화면으로 떨어진다 —
      팀이 있는 사람에게 팀을 만들라고 권하는 화면이고 누르면 중복 팀이 생긴다.
  */
  const at = nav.indexOf('loadError ? (');
  const activeAt = nav.indexOf('!activeTeam ? (');
  assert.ok(at > 0 && activeAt > 0, '검사의 앵커를 못 찾았다 — 분기 모양이 바뀌었으면 이 검사도 고쳐라');
  assert.ok(
    at < activeAt,
    'loadError 분기가 !activeTeam보다 뒤에 있다 — 못 불러온 사람에게 「팀 만들기」를 권하게 된다'
  );

  /* 문구 둘이 실제로 화면에 있는가 */
  for (const text of ['응답이 없어요', '불러오지 못했어요']) {
    assert.ok(nav.includes(text), `화면에 「${text}」가 없다 — 갈래는 있는데 말이 같아진다`);
  }
}

// ── ⑤ 재시도가 상한을 다시 건다 ───────────────────────────────────
{
  const screen = nav.slice(nav.indexOf('function TeamLoadErrorScreen'), nav.indexOf('function LoadingScreen'));
  assert.ok(screen.length > 0, 'TeamLoadErrorScreen을 못 찾았다');
  assert.ok(
    /onAction=\{[^}]*loadMemberships\(\)/.test(screen),
    '「다시 시도」가 loadMemberships를 다시 부르지 않는다 — 상한이 그 함수 안에 있어서, ' +
      '다른 걸 부르면 두 번째 시도는 무한정 기다린다'
  );
}

console.log('teamload ✓ 상한이 걸리고 · 요청을 끊고 · 두 갈래가 화면까지 닿는다');
