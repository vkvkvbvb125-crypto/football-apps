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

// ── ④ 설정 화면의 목록 ──
/*
  행 넷이 있고 순서가 정해져 있다. 개별 행을 하나씩 단언하지 않고 목록으로
  세는 이유는 teamcards.check과 같다 — 다섯째를 넣으면 그날 바로 걸리고,
  「무엇을 넣지 않기로 했는지」가 이 배열에 남는다.

  ⚠ 특히 「팀 설정」이 한 줄인 것을 붙든다. 팀 정보·계좌·회비·게스트를 여기에
    펼치면 진입로가 셋이 된다(팀 히어로 · 팀 화면 타일 · 여기). 같은 값을 세
    곳에서 고치게 되고 어느 화면이 최신인지 모르게 된다.
*/
const SETTINGS = strip(readFileSync('src/features/settings/screens/MySettingsScreen.tsx', 'utf8'));

const rows = [...SETTINGS.matchAll(/label="([^"]+)"/g)].map((m) => m[1]);
/*
  ⚠ 「화면 모드」가 2026-09-01에 들어와 넷이 다섯이 됐다. 알림 바로 아래인 이유는
    둘 다 「앱이 어떻게 굴지」라 이웃이 맞아서다.
    이 배열을 늘릴 때는 「진입로를 늘리지 마라」를 다시 확인해라 — 다섯째를 넣는 게
    아니라 이미 있는 화면으로 가는 줄인지부터 본다.
*/
const EXPECTED_ROWS = ['알림 설정', '화면 모드', '팀 설정', '약관 및 정책', '고객의 소리'];
ok(rows.join(' > ') === EXPECTED_ROWS.join(' > '),
   '설정 목록이 달라졌다. 기대: ' + EXPECTED_ROWS.join(' > ') + ' / 실제: ' + (rows.join(' > ') || '(없음)'));

/*
  회원 탈퇴는 label이 삼항이라 위 정규식에 안 걸린다. 따로 센다 —
  Play·App Store 둘 다 앱 안에 계정 삭제 경로를 요구한다(App Store 5.1.1(v)).
  「셀 때 빠진다」에 걸리지 않으려고, 위에서 빠진다는 사실을 여기 적어 둔다.
*/
ok(/confirmDeleteAccount/.test(SETTINGS), '설정에서 회원 탈퇴가 사라졌다 — 심사에서 막힌다');
ok(/danger/.test(SETTINGS), '회원 탈퇴가 나머지 줄과 같은 모양이다 — 되돌릴 수 없는 것이 안 갈린다');

// ── ⑤ 버전은 읽는다, 박지 않는다 ──
/*
  하드코딩하면 올릴 때마다 두 곳을 고쳐야 하고, 한 곳을 잊으면 화면이 거짓말을 한다.
  ⚠ 부정 단언이라 변이로 확인했다 — 'v1.0.0'을 심으면 잡힌다.
*/
ok(/Constants\.expoConfig\?\.version/.test(SETTINGS),
   '앱 버전을 app.json에서 안 읽는다');
ok(!/['"`]v?\d+\.\d+\.\d+['"`]/.test(SETTINGS),
   '설정 화면에 박힌 버전 문자열이 있다 — app.json과 갈라진다');

// ── ⑥ 로그아웃은 버튼이 아니라 링크 ──
/*
  파괴적 동작을 눈에 덜 띄게 한다. 테두리 친 버튼은 「눌러야 하는 것」으로 읽힌다.
  이건 취향이 아니라 판단이라 붙든다.
*/
ok(/signOutLink/.test(SETTINGS), '로그아웃이 링크 스타일이 아니다');
ok(!/styles\.signOut\b/.test(SETTINGS), '로그아웃이 다시 버튼이 됐다');

// ── ⑦ 옮기면서 권한 분기가 빠지지 않았는가 ──
/*
  프로필 상세는 MySettingsScreen에서 통째로 옮겨 온 화면이다. 옮길 때 제일 쉽게
  빠지는 것이 「보이기는 하는데 총무만 누를 수 있는」 분기다 — 눈으로 보면 똑같이
  그려지기 때문에, 총무 계정으로 확인하면 아무 차이가 안 보인다.

  실력은 총무가 매기는 값이다. 본인이 올리고 내리면 팀 분배 균형이 무너진다.
  ⚠ 이 단언은 기기에서 팀원 계정으로 확인하지 못한 자리를 대신 붙드는 것이다.
    실계정 둘로 확인할 수 있게 되면 그때 눈으로도 한 번 봐야 한다.
*/
const DETAIL = strip(readFileSync('src/features/settings/screens/ProfileDetailScreen.tsx', 'utf8'));
ok(/disabled=\{activeTeam\?\.role !== 'admin'\}/.test(DETAIL),
   '실력 칩의 총무 전용 잠금이 사라졌다 — 팀원이 자기 실력을 고칠 수 있게 된다');
ok(DETAIL.includes('실력은 총무가 정합니다'),
   '잠긴 이유를 말하는 문구가 없다 — 안 눌리는 칩만 남으면 고장으로 읽힌다');

if (fails.length) {
  console.error(fails.map((f) => '  x ' + f).join(String.fromCharCode(10)));
  process.exit(1);
}
console.log('settingsnav ok');
