// scripts/devchain.mjs — 기기에서 이상이 보일 때 앱을 의심하기 전에 먼저 돌린다
//
// ⚠ 이 파일은 *.check.ts가 아니다. checks.mjs가 자동으로 수집하지 않는다 —
//    기기와 Metro가 있어야 하는 검사라 CI에서는 늘 실패한다.
//
// ── 왜 필요해졌나 ───────────────────────────────────────────────────
//
// 이번 세션에서 「앱이 이상하다」로 읽었다가 계측 쪽이었던 것이 네 번이다:
//
//   ① adb emu geo fix가 OK를 반환하고 안 먹었다 → 「코드가 위치를 안 쓴다」로 읽음
//   ② LogBox 전체화면이 입력을 가로챘다        → 「모달을 닫을 수 없다」로 적음
//   ③ adb reverse 소실 + Metro 교착            → 「흰 화면」
//   ④ 같은 둘이 또                              → 「스플래시 되돌린 뒤부터 흰 화면」
//
// ④가 특히 나쁘다. 두 겹이 동시에 났는데 보이는 증상은 하나였고, 그 하나가
// 직전 변경(스플래시)과 시간이 겹쳤다. 증상만 보고 되돌렸으면 엉뚱한 것을
// 건드리고 원인은 그대로 남았을 것이다.
//
//   기기에서 이상이 보이면 앱을 의심하기 전에 사슬을 끝에서부터 짚는다.
//   adb 연결 · reverse 매핑 · Metro 응답 · 앱 프로세스 — 넷 다 조용히 실패한다.
//
// 사슬의 어느 고리가 끊겨도 증상은 같다. 그래서 눈으로 순서를 지키기보다
// 한 번에 다 물어보는 편이 싸다.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const PKG = 'com.kickday.app';
const PORT = 8081;

/** adb 경로 — PATH에 없을 수 있다(세션 셸이 옛 환경을 들고 있는 경우가 많다) */
const ADB = (() => {
  const home = process.env.LOCALAPPDATA ?? process.env.HOME ?? '';
  const guess = join(home, 'Android', 'Sdk', 'platform-tools', 'adb.exe');
  return existsSync(guess) ? guess : 'adb';
})();

const adb = (...args) => {
  try {
    return execFileSync(ADB, args, { encoding: 'utf8', timeout: 20000 }).trim();
  } catch {
    return null;
  }
};

const rows = [];
const say = (name, ok, detail, fix) => rows.push({ name, ok, detail, fix });

// ① adb 연결 — 재연결되면 transport_id가 바뀌고 reverse 매핑이 날아간다
const devices = adb('devices');
const online = devices
  ? devices.split('\n').slice(1).filter((l) => l.trim().endsWith('device'))
  : [];
say('adb 기기', online.length > 0, devices ? online.join(' / ') || '없음' : 'adb 실행 실패',
    'Android Studio에서 에뮬레이터를 켜거나 adb kill-server 후 다시');

// ② reverse 매핑 — 연결마다 새로 걸어야 한다. 사라져도 아무 신호가 없다
const rev = adb('reverse', '--list') ?? '';
const hasRev = rev.includes(`tcp:${PORT} tcp:${PORT}`);
say('adb reverse', hasRev, rev || '(비어 있음)', `adb reverse tcp:${PORT} tcp:${PORT}`);

// ③ Metro — 포트를 물고 있어도 응답을 안 할 수 있다(ERR_STREAM_UNABLE_TO_PIPE).
//    「LISTEN 중인가」가 아니라 「대답하는가」를 물어야 한다.
let metro = null;
try {
  const res = await fetch(`http://127.0.0.1:${PORT}/status`, {
    signal: AbortSignal.timeout(6000),
  });
  metro = await res.text();
} catch (e) {
  metro = null;
}
say('Metro 응답', metro?.includes('running') === true, metro ?? '무응답',
    `8081을 물고 있는 node를 죽이고 npx expo start --dev-client --port ${PORT}`);

// ④ 앱 프로세스
const ps = adb('shell', 'ps', '-A') ?? '';
say('앱 프로세스', ps.includes(PKG), ps.includes(PKG) ? '떠 있음' : '없음',
    `adb shell monkey -p ${PKG} -c android.intent.category.LAUNCHER 1`);

// ⑤ 개발 빌드 전용 오버레이 — 입력을 가로챈다. 「눌렀는데 안 된다」의 원인이 된다
const dump = adb('shell', 'dumpsys', 'notification', '--noredact') ?? '';
say('참고: 알림 채널', dump.includes("mId='default'"), "default 채널", '앱을 한 번 열면 만들어진다');

const width = Math.max(...rows.map((r) => r.name.length));
let broken = 0;
for (const r of rows) {
  console.log(`${r.ok ? 'OK  ' : '✗   '}${r.name.padEnd(width)}  ${r.detail}`);
  if (!r.ok) broken += 1;
}
if (broken) {
  console.log('\n고치는 법:');
  for (const r of rows.filter((x) => !x.ok)) console.log(`  ${r.name}: ${r.fix}`);
  console.log('\n⚠ 여기가 끊겨 있으면 앱 코드를 의심하기 전에 이것부터 고쳐라.');
  console.log('   이 계열로 네 번 헛짚었다 — 자세한 것은 docs/session-2026-08.md.');
  process.exit(1);
}
console.log('\n사슬이 온전하다. 이상이 보이면 이제 앱을 의심해도 된다.');
