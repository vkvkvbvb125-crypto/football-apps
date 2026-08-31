/*
  훅이 컴포넌트 본문에 있는가 — 「훅 규칙」을 코드로 붙든다.

  이 검사가 생긴 이유. 테마 전환을 위해 64개 파일 149개 컴포넌트에 useThemed를
  기계로 넣었는데, 그중 열 곳이 **map 콜백 안**에 들어갔다. 배열 길이만큼 훅이
  불리므로 목록이 바뀌는 순간 터진다:

    Error: Rendered more hooks than during the previous render.
      at NotificationBell

  ⚠ **tsc가 못 본다.** 문법도 타입도 멀쩡하다. 기기에서 알림 패널을 열어야 터졌다.
  ⚠ 눈으로도 거의 못 본다. 코드모드가 어디에 넣든 들여쓰기를 2칸으로 맞춰서,
    훑어보면 컴포넌트 첫 줄처럼 보인다.

  ── 판정 방법을 두 번 틀렸다 ────────────────────────────────────────
  ① 들여쓰기 2칸인가 → 전부 2칸이라 열 곳 다 통과했다
  ② 감싸는 함수 이름이 대문자인가 → 구조분해 인자(`{ navigation }: any`)를
     정규식이 못 읽어서 **멀쩡한 컴포넌트를 105개** 잡았다. 오탐이 그만큼 나오면
     검사를 안 믿게 되고, 그러면 진짜 열 곳도 같이 묻힌다.
  ③ 감싸는 함수의 **선언 줄 들여쓰기가 0인가** → 모듈 최상단 컴포넌트는 0칸에서
     시작하고 콜백은 반드시 들여쓰여 있다. 열 곳을 정확히 잡고 오탐이 0이다.

  「무엇을 후보로 삼는가」를 세 번 바꾼 끝에 맞았다. 앞의 둘을 지우지 않고 적어
  두는 이유는, 다시 이 검사를 손볼 때 같은 두 길로 먼저 가기 때문이다.
*/
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const BS = String.fromCharCode(92), NL = String.fromCharCode(10);
const files: string[] = [];
(function w(d: string) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) w(p);
    else if (n.endsWith('.tsx') || n.endsWith('.ts')) files.push(p.split(BS).join('/'));
  }
})('src');

let bad = 0;
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  const lines = s.split(NL);
  lines.forEach((line, idx) => {
    if (!/=\s*use(Themed|ReelStyles|Colors|ThemeName)\(/.test(line)) return;
    /* 이 줄에서 위로 올라가며 균형이 맞는 여는 중괄호를 찾는다 */
    let off = 0;
    for (let i = 0; i < idx; i++) off += lines[i].length + 1;
    let d = 0, at = -1;
    for (let k = off - 1; k >= 0; k--) {
      if (s[k] === '}') d++;
      else if (s[k] === '{') { if (d === 0) { at = k; break; } d--; }
    }
    if (at < 0) return;
    /* 그 중괄호가 있는 줄의 들여쓰기 */
    const lineStart = s.lastIndexOf(NL, at) + 1;
    const declLine = s.slice(lineStart, s.indexOf(NL, at));
    const indent = declLine.length - declLine.trimStart().length;
    if (indent !== 0) {
      console.error(`  x ${f}:${idx + 1}`);
      console.error(`      감싸는 줄(들여쓰기 ${indent}): ${declLine.trim().slice(0, 72)}`);
      bad++;
    }
  });
}
if (bad) {
  console.error(`  x 훅이 컴포넌트 밖에 있다 — ${bad}곳. 목록이 바뀌면 「Rendered more hooks」로 터진다`);
  process.exit(1);
}
console.log('hookplace ok');
