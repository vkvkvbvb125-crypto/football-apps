/*
  스크린샷 픽스처가 릴리스에 새지 않는가.

  픽스처는 「가짜 데이터를 진짜처럼 보이게」 만드는 코드다. 켜진 채로 나가면
  사용자가 남의 팀·남의 회비를 보고, 그게 자기 데이터라고 믿는다.
  이 저장소에서 제일 나쁘게 끝날 수 있는 파일이라 가드를 검사로 붙든다.

  ⚠ **가드가 셋인 이유.** 하나면 그 하나가 풀리는 날 끝난다.
      ① EXPO_PUBLIC_SCREENSHOT === '1'  — 픽스처와 App.tsx가 각각 본다
      ② 부르는 자리가 App.tsx 하나뿐이다
      ③ 그 변수를 주는 프로필이 **APK**만 뽑는다 — Play는 신규 앱에 AAB만 받는다

  ⚠ **전에는 ①이 `!__DEV__ ||`로 시작했다. 왜 뺐고, 무엇으로 대신했나.**

    스토어 스크린샷은 릴리스 빌드로 찍어야 한다(dev client의 톱니 버블이 헤더와
    겹친다 — 기기에서 확대해 확인했다). 그런데 `__DEV__`는 릴리스에서 false라
    그 가드가 있는 한 **찍어야 할 빌드에서 픽스처가 안 켜진다.**

    ⚠ 그냥 지우면 가드가 느슨해진 것을 아무도 안 본다. 그래서 셋으로 대신했다:

      ⓐ 가드의 **정확한 모양**을 못 박는다. `!== '1'` 한 줄이고, 함수의 **첫 문장**이다.
        `||`가 하나라도 붙으면 실패한다 — 느슨해지는 길이 거기뿐이다.
      ⓑ eas.json에서 그 변수를 주는 프로필이 `screenshot` 하나뿐이고,
        그 프로필이 `apk`를 뽑는다.
      ⓒ `app-bundle`을 뽑는 프로필은 그 변수를 못 갖는다.

    ⓑⓒ가 「번들에 없다」를 대신하는 것이다. 안전장치가 **「켜진 빌드는 올릴 수가
    없다」**로 옮겨졌고, 그쪽이 사람이 실수할 자리가 없다 — 접미사나 꼬리표는
    사람이 확인해야 하지만 AAB/APK는 Play가 막는다.

  ⚠ **검사가 못 보는 것 하나.** EAS 서버의 환경(environment)에 누가
    `EXPO_PUBLIC_SCREENSHOT`을 넣으면 eas.json에 아무 흔적이 없다. 그건 네트워크와
    로그인이 있어야 보이므로 검사 묶음에 넣지 않았다(느려지고, 로그아웃 상태에서는
    조용히 건너뛰게 된다 — 그게 죽은 단언이다).
    대신 **출시 체크리스트의 사람 항목**으로 뒀다. 확인 명령은 docs/store-listing.md에 있다.

  ⚠ 이 검사는 **부정 단언**이 많다. 대상 파일을 먼저 고정하고 그 위에서 본다
    (anchor.ts 「부정 단언을 쓸 때」).
*/
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BS = String.fromCharCode(92);
const read = (p: string) => readFileSync(p, 'utf8').split('\r').join('');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const FIXTURE = 'src/dev/screenshotFixtures.ts';
const ENTRY = 'App.tsx';

const fixture = strip(read(FIXTURE));
const entry = strip(read(ENTRY));

// ── ① 픽스처 자신이 두 조건을 다 본다 ──────────────────────────────
//    부르는 쪽을 믿지 않는다. 여기서 막히면 어디서 불러도 안 돈다.
{
  const at = fixture.indexOf('export function applyScreenshotFixtures');
  assert.ok(at > 0, '진입 함수(applyScreenshotFixtures)가 없다');
  /* 함수 본문을 괄호 균형으로 뗀다 — 창으로 훑으면 옆 함수가 걸린다 */
  let d = 0;
  let end = at;
  for (let i = fixture.indexOf('{', fixture.indexOf(')', at)); i < fixture.length; i += 1) {
    if (fixture[i] === '{') d += 1;
    else if (fixture[i] === '}') {
      d -= 1;
      if (d === 0) {
        end = i;
        break;
      }
    }
  }
  const body = fixture.slice(at, end + 1);
  const guard = body.slice(0, body.indexOf('return false;') + 13);
  assert.ok(/return false;/.test(body), '픽스처가 조건이 안 맞을 때 그냥 돌아가지 않는다');
  /*
    가드의 **정확한 모양**을 본다. 「EXPO_PUBLIC_SCREENSHOT이 들어 있는가」로는
    `env !== '1' || somethingElse` 같은 느슨해진 모양을 못 잡는다.
    느슨해지는 길이 사실상 이 한 줄을 고치는 것뿐이라, 한 줄을 통째로 고정한다.
  */
  const GUARD = "if (process.env.EXPO_PUBLIC_SCREENSHOT !== '1') return false;";
  const firstStatement = body.slice(body.indexOf('{') + 1).trim().split(String.fromCharCode(10))[0].trim();
  assert.equal(
    firstStatement,
    GUARD,
    `픽스처의 첫 문장이 가드가 아니다.
  있어야 할 것: ${GUARD}
  있는 것:      ${firstStatement}`
  );
  /* setState가 가드 **뒤에** 온다. 앞에 있으면 가드가 아무 소용이 없다 */
  assert.ok(
    body.indexOf('return false;') < body.indexOf('.setState('),
    '가드보다 setState가 먼저 온다 — 조건과 무관하게 스토어가 덮인다'
  );
}

// ── ② 부르는 자리가 App.tsx 하나뿐이다 ─────────────────────────────
{
  const files: string[] = [];
  (function walk(d: string) {
    for (const n of readdirSync(d)) {
      const q = join(d, n);
      if (statSync(q).isDirectory()) walk(q);
      else if (n.endsWith('.ts') || n.endsWith('.tsx')) files.push(q.split(BS).join('/'));
    }
  })('src');

  const callers = files.filter(
    (f) => f !== FIXTURE && /applyScreenshotFixtures|screenshotFixtures/.test(strip(read(f)))
  );
  assert.deepEqual(
    callers,
    [],
    `src/ 안에서 픽스처를 부르는 곳이 있다: ${callers.join(', ')} — App.tsx 하나여야 한다`
  );

  assert.ok(/applyScreenshotFixtures/.test(entry), 'App.tsx가 픽스처를 안 부른다 — 켤 방법이 없다');
  const calls = entry.match(/applyScreenshotFixtures\(/g) ?? [];
  assert.equal(calls.length, 1, `App.tsx에서 ${calls.length}번 부른다 — 한 번이어야 한다`);
}

// ── ③ 부르는 자리도 같은 조건을 본다 ───────────────────────────────
//    ①이 이미 막지만, 여기서도 막아야 릴리스 번들에서 **모듈째로** 접힌다.
{
  const at = entry.indexOf('applyScreenshotFixtures(');
  const before = entry.slice(Math.max(0, at - 300), at);
  const cond = before.slice(before.lastIndexOf('if ('));
  assert.equal(
    cond.trim(),
    "if (process.env.EXPO_PUBLIC_SCREENSHOT === '1') {",
    `App.tsx의 호출 조건이 정확한 모양이 아니다 — 있는 것: ${cond.trim()}`
  );
}

// ── ④ 픽스처가 진짜 데이터를 만지지 않는다 ─────────────────────────
//    스토어에 값을 넣는 것까지다. 네트워크로 나가면 그건 픽스처가 아니라 시딩이다.
{
  assert.ok(!/from '.*lib\/supabase'/.test(fixture), '픽스처가 supabase를 부른다 — 진짜 DB를 건드릴 수 있다');
  assert.ok(!/\bfetch\(/.test(fixture), '픽스처가 네트워크를 탄다');
}

// ── ⑤ 「테스트1」·「asdf」 같은 것이 안 들어갔는가 ──────────────────
//    스크린샷에 하나라도 있으면 그것만 보인다.
{
  const junk = fixture.match(/'[^']*(테스트|asdf|ㅁㄴㅇ|aaa|qwer|test\d|샘플)[^']*'/gi) ?? [];
  assert.deepEqual(junk, [], `픽스처에 임시 문구가 남아 있다: ${junk.join(', ')}`);
}



// ── ⑥ 그 변수를 주는 프로필이 APK만 뽑는가 ─────────────────────────
//    「번들에 없다」를 대신하는 구조적 차단이다. Play는 신규 앱에 AAB만 받으므로,
//    픽스처가 켜지는 빌드가 APK뿐이면 그건 스토어에 올라갈 수가 없다.
{
  const eas = JSON.parse(readFileSync('eas.json', 'utf8')) as {
    build: Record<string, { extends?: string; env?: Record<string, string>; android?: { buildType?: string } }>;
  };
  const profiles = eas.build ?? {};

  /* extends를 풀어 buildType을 정한다 — 자기 값이 이긴다 */
  const buildTypeOf = (name: string, seen = new Set<string>()): string | undefined => {
    if (seen.has(name)) return undefined;
    seen.add(name);
    const p = profiles[name];
    if (!p) return undefined;
    return p.android?.buildType ?? (p.extends ? buildTypeOf(p.extends, seen) : undefined);
  };

  const KEY = 'EXPO_PUBLIC_SCREENSHOT';
  const setters = Object.keys(profiles).filter((n) => profiles[n].env?.[KEY] !== undefined);

  assert.deepEqual(
    setters,
    ['screenshot'],
    `${KEY}를 주는 프로필이 [${setters.join(', ')}]다 — screenshot 하나여야 한다.\n` +
      `  → production-apk에는 주지 마라. 그건 내가 설치해 확인하는 빌드라,\n` +
      `    픽스처가 켜지면 실기기 확인이 가짜 데이터로 이뤄진다.`
  );
  assert.equal(profiles.screenshot.env?.[KEY], '1', `screenshot 프로필의 ${KEY}가 '1'이 아니다`);

  for (const name of setters) {
    assert.equal(
      buildTypeOf(name),
      'apk',
      `${name} 프로필이 ${KEY}를 주는데 buildType이 apk가 아니다(${buildTypeOf(name)}).\n` +
        `  → app-bundle이면 스토어에 올라갈 수 있다. 픽스처가 켜진 빌드는 APK여야 한다.`
    );
  }
}

console.log('screenshot ok — 가드 한 줄 고정 · 부르는 자리 하나 · 픽스처 프로필은 APK만');
