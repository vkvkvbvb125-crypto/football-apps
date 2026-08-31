/*
  설정으로 가는 길은 하나다.

  예전 구조: 톱니 → 오른쪽에서 밀고 들어오는 패널(제목 「설정」) → 「내 설정」 →
  MySettingsScreen(제목 「설정」). 「설정 → 설정 → 설정」이었고, 중간 패널이 하는
  일은 한 번 더 누르게 하는 것뿐이었다.

  그 패널에는 로그아웃도 있었다. MySettingsScreen에도 있었다. 같은 파괴적 동작이
  두 화면에 있으면 어느 쪽이 진짜인지 아무도 모르고, 한쪽만 고치면 갈라진다.

  이 검사가 지키는 것 셋:
    ① 톱니는 패널이 아니라 화면으로 간다
    ② TabHeader에 Modal은 하나다 — 둘이 되면 설정 패널이 되살아난 것이다
    ③ 로그아웃을 부르는 화면 파일이 정해진 목록과 같다

  ⚠ ③은 호출 모양과 JSX 속성 모양을 둘 다 센다. `signOut()`만 찾으면
    `onPress={signOut}`이 빠진다 — 실제로 전수 조사가 그것 때문에 한 번 틀렸다
    (anchor.ts 아홉째 구분).
*/
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/* 이스케이프를 쓰지 않는다 — 이 저장소에서 문자열이 셸을 두 번 지나가며 열 번 넘게 샜다 */
const BS = String.fromCharCode(92);

const fails: string[] = [];
const ok = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };

const strip = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const HEADER = 'src/components/TabHeader.tsx';
const header = strip(readFileSync(HEADER, 'utf8'));

// ── ① 톱니는 화면으로 간다 ──
ok(/export function SettingsButton\(\)/.test(header),
   'TabHeader에 SettingsButton이 없다');
ok(/navigation\.navigate\('MySettings'\)/.test(header),
   "톱니가 MySettings로 안 간다 — 중간에 뭔가가 다시 끼었다");

// ── ② Modal은 하나 ──
//    알림 벨의 것 하나뿐이어야 한다. 설정 패널이 돌아오면 둘이 된다.
const modals = (header.match(/<Modal[\s>]/g) ?? []).length;
ok(modals === 1, `TabHeader의 Modal이 ${modals}개다 — 알림 벨 하나여야 한다. 설정 패널이 되살아났는가`);

// ── ③ 로그아웃 자리 ──
//    호출 `signOut()` 과 JSX 속성 `onPress={signOut}` 을 둘 다 센다.
const files: string[] = [];
(function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.tsx')) files.push(p.split(BS).join('/'));
  }
})('src');

const CALL = /(?<![A-Za-z])signOut\s*\(\s*\)/;          // signOut()
const ATTR = /=\{\s*signOut\s*\}/;                       // onPress={signOut}
const callers = files
  .filter((f) => { const s = strip(readFileSync(f, 'utf8')); return CALL.test(s) || ATTR.test(s); })
  .sort();

/*
  둘이다. 왜 이 둘인지:
    MySettings   설정 화면의 로그아웃. 계정에 딸린 동작이라 자리가 여기다.
    TeamStart    팀이 없을 때 뜨는 화면. 여기서 갈 곳이 로그아웃뿐이라 없으면 갇힌다.
  셋째가 생기면 「어느 쪽이 진짜냐」가 다시 시작된다.
*/
const EXPECTED = [
  'src/features/settings/screens/MySettingsScreen.tsx',
  'src/features/team/screens/TeamStartScreen.tsx',
];
ok(callers.join(' | ') === EXPECTED.join(' | '),
   'signOut을 부르는 화면이 달라졌다.' +
   ' 기대: ' + EXPECTED.join(', ') +
   ' / 실제: ' + (callers.join(', ') || '(없음)'));

if (fails.length) {
  console.error(fails.map((f) => '  x ' + f).join(String.fromCharCode(10)));
  process.exit(1);
}
console.log('settingsnav ok');
