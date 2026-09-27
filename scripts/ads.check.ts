/*
  광고가 **새지 않는가.**

  ── 왜 이 검사가 있나 ──────────────────────────────────────────────
  광고는 틀리면 **돈이 아니라 계정이 걸린다.** 자기 광고를 자기가 누르거나,
  관심 없는 테스터의 클릭이 쌓이면 **무효 트래픽**으로 잡히고 그건 게시자 책임이다.
  수익 차감으로 끝나면 다행이고 계정 정지면 되돌리기 어렵다.

  ⚠ **여기서 막으려는 실수는 사람이 눈으로 못 보는 것들이다.**
    · 실제 단위 ID가 어느 파일에 복사돼서 테스트 빌드로 새는 것
    · `eas.json`의 `extends` 때문에 **판정용 APK가 실제 광고를 얻는 것**
    · 돈 다루는 화면에 광고가 붙는 것
    · 처리방침이 「광고 식별자를 안 쓴다」고 말한 채 광고가 도는 것

  ── ⚠ 이 파일 자체가 함정이다 ────────────────────────────────────
  이 검사는 **실제 단위 ID 문자열을 본문에 갖고 있다.** 그래서 「그 문자열이
  adUnits.ts 밖에 있으면 FAIL」을 그대로 돌리면 **자기 자신을 잡는다.**
  `scripts/`를 훑는 대상에서 빼는 이유가 그것이다 — 2026-09-19에 「해명 주석에
  검사 앵커가 들어가 통과해 버린」 다섯 건을 겪은 것과 같은 계열의 덫이다.
*/
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const rel = (f: string) => f.split(sep).join('/');

/* 주석을 걷어내고 본다 — 해명 주석이 앵커를 품어 통과시키는 일을 막는다 */
const strip = (t: string) =>
  t
    .split('\r')
    .join('')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');

const walk = (d: string, out: string[] = []): string[] => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) {
      if (!p.includes('__tests__')) walk(p, out);
    } else if (/\.tsx?$/.test(n)) out.push(p);
  }
  return out;
};

const srcFiles = walk('src');
assert.ok(srcFiles.length > 50, `src 파일을 ${srcFiles.length}개밖에 못 찾았다 — 경로 규칙이 바뀌었나`);

const UNITS = 'src/features/ads/adUnits.ts';
const unitsSrc = readFileSync(UNITS, 'utf8');

/* ── ⑴ 실제 단위 ID는 adUnits.ts에만 있다 ───────────────────────── */
/*
  ⚠ 문자열을 **조각내서** 적는다. 통째로 적으면 이 파일이 「실제 ID를 가진 파일」이
    되어, 언젠가 대상 범위가 넓어지는 날 자기 자신을 잡는다.
*/
const REAL_UNIT = 'ca-app-pub-8655981738970005' + '/' + '8011439612';

assert.ok(
  unitsSrc.includes(REAL_UNIT),
  `실제 단위 ID가 ${UNITS}에 없다 — 옮겼다면 이 검사도 같이 옮겨라`
);

const leaked = srcFiles.filter((f) => rel(f) !== UNITS && readFileSync(f, 'utf8').includes(REAL_UNIT));
assert.deepEqual(
  leaked,
  [],
  `실제 광고 단위 ID가 ${UNITS} 밖에 있다. 부르는 쪽은 HOME_NATIVE_UNIT_ID 상수만 읽어라 — ` +
    `복사본이 생기면 테스트 빌드로 새는 길이 하나 더 는다:\n  ` +
    leaked.map(rel).join('\n  ')
);

/* ── ⑵ 가르는 기준이 환경변수이고, real은 production에만 있다 ──── */
const unitsBody = strip(unitsSrc);
assert.ok(
  /process\.env\.EXPO_PUBLIC_ADS\s*===\s*'real'/.test(unitsBody),
  `${UNITS}가 EXPO_PUBLIC_ADS === 'real'로 가르지 않는다. ` +
    `__DEV__로 되돌리지 마라 — 릴리스 빌드가 두 종류(판정 APK · 비공개 테스트 AAB)라 안 갈린다`
);

const eas = JSON.parse(readFileSync('eas.json', 'utf8')) as {
  build: Record<string, { extends?: string; env?: Record<string, string> }>;
};
const profiles = Object.entries(eas.build);
assert.ok(profiles.length >= 4, `eas.json 프로필이 ${profiles.length}개뿐이다 — 파일 모양이 바뀌었나`);

/*
  ⚠ **모든 프로필이 값을 직접 갖는다. `extends` 상속에 기대지 않는다.**
    production-apk · closedtest · screenshot이 전부 production을 extends한다.
    상속이 env까지 끌어온다면 **판정용 APK가 실제 광고를 얻는다** —
    그게 이 검사에서 제일 잡고 싶은 구멍이다. 명시해 두면 규칙이 어떻든 안전하다.
*/
const missing = profiles.filter(([, p]) => p.env?.EXPO_PUBLIC_ADS === undefined).map(([n]) => n);
assert.deepEqual(
  missing,
  [],
  `EXPO_PUBLIC_ADS를 직접 안 가진 프로필이 있다. extends 상속에 기대지 마라 — ` +
    `상속이 env를 끌어오면 판정용 빌드가 실제 광고를 얻는다:\n  ` + missing.join(', ')
);

const real = profiles.filter(([, p]) => p.env?.EXPO_PUBLIC_ADS === 'real').map(([n]) => n);
assert.deepEqual(
  real,
  ['production'],
  `EXPO_PUBLIC_ADS=real을 가진 프로필은 production 하나여야 한다. 지금: ${real.join(', ') || '없음'}\n` +
    `⚠ 비공개 테스트 AAB는 closedtest로 뽑고, Play에서 **승격(promote)하지 마라** — ` +
    `같은 바이너리가 프로덕션으로 올라간다`
);

/* ── ⑶ 돈 다루는 화면에 광고가 없다 ─────────────────────────────── */
/*
  정산·회비·송금은 **금액을 입력하고 확인하는** 자리다. 오탭 한 번이 광고 클릭이 되고
  그 사이 입력이 날아가면 돈 이야기에서 신뢰를 잃는다. 총무가 **남의 돈**을 다루는
  화면이라, 광고가 붙으면 앱이 그 돈으로 장사하는 것처럼 읽힌다(docs/admob.md ③).
*/
const MONEY = /^src\/features\/settlement\//;
const adImport = /from\s+'[^']*\/ads\/[^']*'|from\s+'react-native-google-mobile-ads'/;
const moneyWithAds = srcFiles
  .filter((f) => MONEY.test(rel(f)))
  .filter((f) => adImport.test(strip(readFileSync(f, 'utf8'))));
assert.deepEqual(
  moneyWithAds.map(rel),
  [],
  `정산·회비·송금 화면에 광고가 붙었다. 그 자리는 금액을 입력하고 확인하는 곳이라 ` +
    `오탭이 광고 클릭이 되고, 남의 돈을 다루는 화면에 광고가 붙으면 그 돈으로 장사하는 것처럼 읽힌다:\n  ` +
    moneyWithAds.map(rel).join('\n  ')
);

/* ── ⑷ 처리방침이 거짓말하지 않는가 ────────────────────────────── */
/*
  ⚠ 광고를 붙이는 순간 「광고 식별자를 사용하지 않습니다」가 **거짓**이 된다.
    이 문장은 앱 안 동의 화면과 kickday.app/privacy에 **같이** 나간다
    (terms.ts가 원본이고 build-web-terms.mjs가 웹을 만든다).
    거짓 고지는 정책 위반이자 법 위반이다 — 사람 기억에 맡기지 않는다.
*/
const terms = readFileSync('src/features/auth/terms.ts', 'utf8');
assert.ok(
  !/광고 식별자[^\n]*사용하지 않습니다/.test(terms),
  `terms.ts가 아직 「광고 식별자를 사용하지 않습니다」라고 말한다. ` +
    `광고를 붙였으면 그 문장은 거짓이다 — 수집 항목·이용 목적·처리 위탁·국외 이전·제3자 다섯 자리를 고쳐라`
);
assert.ok(
  /광고 식별자/.test(terms) && /AdMob|Google LLC/.test(terms),
  `terms.ts에 광고 식별자 수집과 Google 위탁이 안 적혀 있다 — 광고를 켜기 전에 고지가 먼저다`
);

console.log(
  `ads ✓ 실제 단위 ID는 ${UNITS}에만 · real은 production 프로필만(${profiles.length}개 모두 명시) · ` +
    `정산 화면 광고 0 · 처리방침 고지 있음`
);
