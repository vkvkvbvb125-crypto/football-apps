/*
  한 네비게이터에 같은 이름의 화면이 둘 있는가.

  ── 왜 이 검사가 있나 ──────────────────────────────────────────────
  `RootNavigator`는 조건에 따라 화면 목록을 통째로 갈아 끼운다.

      !session      ? Login · SignUp · ForgotPassword
      !teamLoaded   ? TeamLoading
      loadError     ? TeamLoadError
      !activeTeam   ? TeamOnboarding
                    : Main · TeamOnboarding · TeamSettings · …
                             ~~~~~~~~~~~~~~ 같은 이름이 양쪽에 있었다

  ⚠ **React Navigation은 목록이 바뀔 때, 지금 포커스된 라우트 이름이 새 목록에도 있으면
    그대로 머문다.** 그래서 팀이 생겨 브랜치가 바뀌어도 화면이 안 넘어갔다.

  ⚠ **증상이 원인을 가린다.** 사용자 눈에는 「만들기를 눌렀는데 아무 일도 안 난다」이고,
    그래서 다시 누른다 — **누를 때마다 팀이 실제로 만들어진다.** 2026-09-16에 10개를
    만들고서야 알았다. 앱을 재시작하니 그제서야 홈으로 들어갔다.
    **데이터는 처음부터 맞았고 화면만 안 따라왔다** — 성공이 실패처럼 보이는 자리다.

  ── 이 검사가 보는 것 ─────────────────────────────────────────────
  `<Stack.Screen name="X">`의 X가 파일 안에서 두 번 이상 나오면 실패한다.

  ⚠ **주석을 걷어내고 센다.** 이 파일에는 과거 모양을 설명하는 주석에
    `<Stack.Screen name="Main">`이 그대로 적혀 있어서, 안 걷어내면 Main이 중복으로 잡힌다.
    (anchor.ts 「사본을 셀 때」 — 근거를 적으면 그 이름이 주석에 남는다)

  ⚠ 못 보는 것: 다른 파일의 네비게이터는 안 본다. `MainTabNavigator`의 탭 이름은
    별개 네비게이터라 여기와 겹쳐도 문제가 아니다.
*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const NAV = 'src/navigation/RootNavigator.tsx';

const src = readFileSync(NAV, 'utf8')
  .split('\r')
  .join('')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split(String.fromCharCode(10))
  .map((l) => l.replace(/\/\/.*$/, ''))
  .join(String.fromCharCode(10));

const names = [...src.matchAll(/<Stack\.Screen\s+name="([^"]+)"/g)].map((m) => m[1]);
assert.ok(names.length > 5, `Stack.Screen을 ${names.length}개만 찾았다 — 모양이 바뀌었으면 이 검사도 고쳐라`);

const seen = new Map<string, number>();
for (const n of names) seen.set(n, (seen.get(n) ?? 0) + 1);
const dup = [...seen].filter(([, c]) => c > 1).map(([n, c]) => `${n}(${c}번)`);

assert.deepEqual(
  dup,
  [],
  `같은 이름의 화면이 둘 이상 등록돼 있다: ${dup.join(', ')}\n` +
    `  → 브랜치가 바뀌어도 그 라우트에 머문다. 화면이 안 넘어가고, 사용자는 다시 누른다.\n` +
    `  → 같은 컴포넌트를 두 자리에 둬야 하면 **이름을 다르게** 해라\n` +
    `     (예: TeamOnboarding ↔ TeamAddAnother). 부르는 자리도 같이 고쳐라.`
);

/* 고친 그 자리를 이름으로 못 박는다 — 이 검사가 실제로 무엇을 지키는지 남긴다 */
assert.ok(
  names.includes('TeamOnboarding') && names.includes('TeamAddAnother'),
  'TeamOnboarding / TeamAddAnother 둘 다 없다 — 이름을 다시 합쳤다면 같은 증상이 돌아온다'
);

/* 부르는 자리가 살아 있는가. 이름만 바꾸고 caller를 안 고치면 아무 데도 안 간다 */
const home = readFileSync('src/features/team/screens/TeamHomeScreen.tsx', 'utf8');
assert.ok(
  /navigate\('TeamAddAnother'\)/.test(home),
  'TeamHomeScreen이 TeamAddAnother로 안 간다 — 팀 전환 시트의 「새 팀 만들기」가 죽는다'
);

console.log(`screenname ✓ 화면 이름 ${names.length}개가 모두 다르다`);
