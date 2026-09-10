/*
  튜토리얼이 짚겠다고 적은 자리가 실제로 등록돼 있는가.

  ── 왜 필요한가 ────────────────────────────────────────────────────
  steps.ts는 `target: 'home.matchCard'`처럼 **이름만** 적는다. 그 이름에 ref를 다는
  것은 화면 쪽 일이고(`useTourTarget('home.matchCard')`), 둘을 잇는 것은 문자열뿐이다.
  안 이으면 **아무 일도 안 일어난다** — TourProvider가 12번 재보고 못 재면
  구멍 없이 말풍선만 띄우기 때문에, 화면에는 「설명은 나오는데 아무것도 안 짚는」
  멀쩡해 보이는 결과가 남는다. 에러도 경고도 없다.

  실제로 그렇게 돼 있었다(2026-09-10, 기기에서 재서 찾았다):
    · `home.matchCard`  — 팀원 코스 1단계. **어디에도 등록돼 있지 않았다.**
    · `attendance.create` — 총무 코스 2단계. 등록은 돼 있었지만 「날짜를 고른 뒤에만」
      그려지는 Pressable에 달려 있어서, 튜토리얼이 도는 시점에는 없었다.

  이 저장소에서 이번 세션에만 네 번째인 「만들어 두고 잇지 않은」 것이다.

  ── 이 검사가 보는 것과 못 보는 것 ─────────────────────────────────
  본다    steps.ts가 부르는 이름이 `useTourTarget(...)`로 등록되는가
  못 본다 그 ref가 **늘 그려지는 자리**에 달려 있는가

  두 번째는 정적으로 못 본다 — `{next && matchDate && (` 안인지 밖인지는 렌더 결과다.
  ⚠ 그러니 이 검사가 통과해도 **기기에서 한 번은 봐야 한다.** 위의 두 번째 사례
    (`attendance.create`)는 이 검사를 통과했을 것이다. 검사가 잡는 것은 첫 번째뿐이고,
    그건 「검사가 있으니 봤다」로 읽으면 안 된다는 뜻이다.
*/
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/* CRLF를 정규화한다 — 안 하면 개행이 든 정규식이 못 찾고 항상 실패한다 */
const read = (p: string) => readFileSync(p, 'utf8').split('\r').join('');

const steps = read('src/features/tour/steps.ts');

/*
  steps.ts에서 실제로 쓰이는 target을 뽑는다.
  ⚠ `TourTarget` 유니언이 아니라 **단계 정의**에서 뽑는다. 유니언에는 지금 안 쓰는
    이름이 남아 있을 수 있고(그건 죽은 이름이지 깨진 링크가 아니다),
    깨지는 것은 「단계가 부르는데 아무도 안 받는」 쪽이다.
*/
const called = new Set(
  [...steps.matchAll(/target:\s*'([^']+)'/g)].map((m) => m[1]),
);

assert.ok(
  called.size > 0,
  'steps.ts에서 target을 하나도 못 뽑았다 — 모양이 바뀌었으면 이 검사도 고쳐라',
);

/*
  src 전체에서 그 이름이 **화면 코드에 문자열로 있는가**를 본다.

  ⚠ `useTourTarget('X')`만 찾으면 안 된다. 탭 아이콘은 한 겹 건너간다 —
    `tabIcon('calendar-outline', 'tab.attendance')` → `<TourSpot name={tour}>` →
    `useTourTarget(name)`. 부르는 자리에는 변수만 있고 리터럴은 위에 있다.
    처음에 좁게 짰다가 tab.attendance·tab.settlement를 「등록 안 됨」으로 잡았다.

  ⚠ **이 단언이 무엇을 증명하는지 정확히 적는다.** 「이 이름이 화면 코드 어딘가에
    문자열로 있다」까지다. 그게 ref로 이어지는지까지는 안 본다. 그래도 값이 있는 것은,
    실제로 깨졌던 `home.matchCard`가 steps.ts 바깥 **어디에도 없었기** 때문이다 —
    잇는 것을 잊으면 이름이 아예 안 나타난다.
*/
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') || p.endsWith('.ts') ? [p] : [];
  });

/* 정의하는 쪽(steps.ts·TourProvider)은 세지 않는다 — 자기 자신을 근거로 삼게 된다 */
const screens = walk('src')
  .filter((f) => !f.includes(join('features', 'tour')))
  .map(read)
  .join(String.fromCharCode(10));

const missing = [...called].filter((t) => !screens.includes(`'${t}'`) && !screens.includes(`"${t}"`));
assert.deepEqual(
  missing,
  [],
  `튜토리얼이 짚겠다고 적었는데 등록하는 화면이 없다: ${missing.join(', ')}\n` +
    `  → 짚을 요소에 useTourTarget('<이름>')의 ref를 달거나, steps.ts에서 target을 null로 바꿔라.\n` +
    `  → null로 두면 구멍 없이 문구만 뜬다. 그때는 문구를 미래형으로 고쳐라 (총무 3단계가 본보기다).`,
);

console.log(`tour ✓ 단계가 부르는 자리 ${called.size}곳 모두 등록돼 있다`);

/*
  ── 둘째: 투어가 도는 동안 Modal이 언마운트되지 않는가 ───────────────

  생명주기라 개수를 셀 수 없다. 「Coachmark가 하나」는 정적으로 참이었는데도 사고가 났다 —
  하나짜리가 **단계마다 새로 만들어졌다.** 그래서 세는 대신 **마운트 조건**을 붙든다.

  원인이 된 코드는 이것이었다:

      {!!step && ready && (<Coachmark … />)}          ← ready가 조건에 있다

  `ready`는 한 단계 안에서 false→true로 오간다. 조건에 들어가 있으면 그때마다
  Modal이 통째로 언마운트/리마운트되고, 안드로이드에서 Modal은 네이티브 Dialog 창이라
  창이 새로 만들어진다. 기기에서 잰 결과(logcat):

      · setReady(false) 뒤 실제 언마운트까지 327·344·348ms — 그 사이 탭은 이미 바뀌어
        있어서 **이전 화면용 말풍선이 다음 화면 위에** 남았다
      · 언마운트~다음 마운트 사이 0.8~1.4초 동안 **막이 아예 없었다**

  고친 뒤에는 다섯 단계를 도는 동안 언마운트가 **끝날 때 한 번**뿐이다.

  ⚠ 이 검사가 증명하는 것: 「마운트 조건에 `ready`/`spot`이 없다」까지다.
    실행 중에 정말로 안 죽는지는 못 본다 — 그건 기기에서 logcat으로만 봤다.
    조건을 다른 이름의 상태로 바꿔 끼우면 이 검사는 통과한다.
*/
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(String.fromCharCode(10))
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join(String.fromCharCode(10));

const provider = read('src/features/tour/TourProvider.tsx');

const coachmarkSites = provider.split('<Coachmark').length - 1;
assert.equal(coachmarkSites, 1, `TourProvider가 <Coachmark>를 ${coachmarkSites}곳에서 그린다 — 하나여야 한다`);

/* `<Coachmark` 바로 앞의 JSX 가드. `{...&& (` 꼴을 뒤에서부터 찾는다 */
const before = provider.slice(0, provider.indexOf('<Coachmark'));
const guard = before.slice(before.lastIndexOf('{!!'));
assert.ok(
  guard.includes('&&') && guard.length < 400,
  'TourProvider의 <Coachmark> 마운트 조건을 못 찾았다 — 모양이 바뀌었으면 이 검사도 고쳐라',
);
/*
  ⚠ **정규식을 문자열로 조립하지 않는다.** `new RegExp(`\b${x}\b`)`로 짰더니
    템플릿 리터럴의 \b가 **백스페이스 문자**로 해석돼 무엇을 넣어도 안 맞았다.
    변이를 두 개 넣었는데 둘 다 통과해서 「안 잡힌다」로 읽을 뻔했다 —
    실제로는 **단언이 죽어 있었다.** checks.mjs의 「변이가 안 잡힌다 ≠ 안 들어갔다」와
    같은 계열이고, 축이 하나 더 있다: **단언 자체가 실행은 되는데 참일 수 없는** 경우다.
*/
assert.ok(
  !/\bready\b/.test(guard),
  '<Coachmark>의 마운트 조건에 `ready`가 있다.\n' +
    '  → 그 값은 한 단계 안에서 false↔true로 오가므로 Modal이 단계마다 언마운트/리마운트된다.\n' +
    '  → 조건에서 빼고 **프롭으로 넘겨서** Coachmark 안에서 감춰라.',
);
assert.ok(
  !/\bspot\b/.test(guard),
  '<Coachmark>의 마운트 조건에 `spot`이 있다 — ready와 같은 이유로 안 된다.',
);
/* ⚠ 주석을 빼고 본다 — 위 주석에 적어 둔 `ready={false}`를 코드로 잡았다 */
assert.ok(
  /ready=\{/.test(stripComments(provider)),
  'ready를 Coachmark에 프롭으로 안 넘긴다 — 마운트 조건에서 뺐으면 안에서 감춰야 한다',
);

/*
  ── 셋째: 화면 코드가 Main으로 되돌아갈 때 스택을 쌓지 않는가 ────────

  `navigation.navigate('Main')`으로 돌아갔더니 스택에 Main이 하나 더 얹혔고 옛것은
  안 사라졌다. Main 안에 TourProvider가 있어서 **튜토리얼이 둘** 돌았고, 각자 자기
  단계를 들고 있어 **코치마크 두 장이 동시에** 떴다(기기에서 인스턴스 id로 확인).
  돌아가는 것은 goBack이다.

  ⚠ `navigate('Main', { screen })`은 다르다 — 탭을 고르는 것이라 그대로 둔다.
    RootNavigator 자신은 그 용도로 쓰므로 여기서 뺀다.
*/
/*
  ⚠ **주석을 빼고 본다.** 이 저장소는 근거를 주석에 적으므로 같은 문자열이 코드와
    주석 양쪽에 있는 일이 흔하다 — 실제로 「goBack이다, navigate('Main')이 아니다」라고
    적어 둔 주석을 이 검사가 코드로 잡았다. checks.mjs가 경고하는 그 함정이다.
*/


const stacking = walk('src')
  .filter((f) => !f.includes(join('navigation', 'RootNavigator')))
  .filter((f) => /navigate\(\s*'Main'\s*\)/.test(stripComments(read(f))));
assert.deepEqual(
  stacking.map((f) => f.split(String.fromCharCode(92)).join('/')),
  [],
  `navigate('Main')으로 되돌아가는 화면이 있다: ${stacking.join(', ')}\n` +
    `  → goBack()을 써라. navigate는 Main을 하나 더 얹고, 그러면 TourProvider가 둘이 된다.`,
);

console.log('tour ✓ Modal 마운트 조건에 단계 내 상태가 없고, Main으로 되돌아가는 화면이 없다');
