/*
  스크린샷 픽스처가 릴리스에 새지 않는가.

  픽스처는 「가짜 데이터를 진짜처럼 보이게」 만드는 코드다. 켜진 채로 나가면
  사용자가 남의 팀·남의 회비를 보고, 그게 자기 데이터라고 믿는다.
  이 저장소에서 제일 나쁘게 끝날 수 있는 파일이라 가드를 검사로 붙든다.

  ⚠ **가드가 셋인 이유.** 하나면 그 하나가 풀리는 날 끝난다.
      ① __DEV__            릴리스 번들에서 false — Metro가 상수로 접어 없앤다
      ② EXPO_PUBLIC_SCREENSHOT === '1'
      ③ 부르는 자리가 App.tsx 하나뿐이다

    ①만 두지 않은 까닭: 개발 빌드로 시연하다 켜진 채 남는 경로가 있다.
    ②를 따로 두면 켜는 것이 언제나 의도적인 일이 된다.
    ③이 없으면 다른 화면이 부르기 시작하면서 ①②를 안 보는 자리가 생긴다 —
    이번 세션에 「가드가 한 곳에만 있어 새는」 모양을 여러 번 봤다.

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
  assert.ok(/!__DEV__/.test(guard), '픽스처 안에서 __DEV__를 안 본다');
  assert.ok(
    /EXPO_PUBLIC_SCREENSHOT !== '1'/.test(guard),
    "픽스처 안에서 EXPO_PUBLIC_SCREENSHOT을 안 본다 — __DEV__만으로는 개발 빌드에서 켜진 채 남는다"
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
  assert.ok(/__DEV__/.test(before), 'App.tsx의 호출이 __DEV__ 안에 없다');
  assert.ok(
    /EXPO_PUBLIC_SCREENSHOT === '1'/.test(before),
    "App.tsx의 호출이 EXPO_PUBLIC_SCREENSHOT을 안 본다"
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

console.log('screenshot ok');
