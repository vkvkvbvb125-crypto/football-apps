// scripts/placemap.check.ts — 구장 지도가 화면에 닿는가
//
// 이 컴포넌트는 만들어져 있는데 **여는 자리가 없어서** 넉 달 동안 안 보였다.
// 2026-07-27 58ff35f(일정 화면 재설계)가 옛 목록의 진입로를 새 카드로 안 옮겼고,
// 그 커밋 diff에 「PlaceDetailModal … 은 기존 그대로 사용합니다」가 삭제로 찍혀 있다 —
// 빼기로 한 게 아니라 이관 누락이다.
//
// 죽은 코드의 네 번째이고, 앞의 셋과 다른 점은 **화면이 다 완성돼 있다**는 것이다.
// 타입도 맞고 파일도 멀쩡해서 tsc도 린터도 아무 말을 안 했다.
//
// 그래서 여기서 보는 것은 값도 모양도 아니고 **「그리는 코드와 여는 코드가 둘 다
// 있는가」**다. 하나만 있으면 실패한다 — 그게 이 사고의 모양이었다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onlyMatch } from './lib/anchor.ts';

// CRLF를 정규화한다 — 안 하면 개행이 든 정규식이 못 찾고 항상 실패한다
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').split('\r').join('');
const screen = read('src/features/attendance/screens/AttendanceScreen.tsx');
const card = read('src/features/attendance/components/MatchDetailCard.tsx');
const modal = read('src/features/attendance/components/PlaceDetailModal.tsx');

// ── 1. 그리는 코드와 여는 코드가 둘 다 있다 ────────────────────────
{
  assert.ok(/<PlaceDetailModal/.test(screen), 'PlaceDetailModal을 그리는 자리가 없다');
  assert.ok(/setDetailMatch\(selectedMatch\)/.test(screen), '모달을 여는 자리가 없다 — 컴포넌트만 있고 문이 없다');
  assert.ok(/onOpenPlace=\{/.test(screen), '카드에 진입로를 안 넘긴다');
  assert.ok(/p\.onOpenPlace \?/.test(card), '카드가 진입로를 안 받는다');
  assert.ok(/onPress=\{p\.onOpenPlace\}/.test(card), '구장 이름이 안 눌린다');
}

// ── 2. 좌표가 없으면 안 누르게 둔다 ────────────────────────────────
//
// 좌표 없이 열면 이름만 있는 모달이 뜨고 「눌렀더니 아무것도 없다」가 된다.
// 판단은 부모가 한다 — 좌표가 있는지는 부모가 안다.
{
  const gate = onlyMatch(screen, /onOpenPlace=\{[\s\S]*?\n\s*\}/, '진입로 조건');
  assert.ok(/latitude != null && selectedMatch\.longitude != null/.test(gate),
    `좌표 없이도 지도를 연다: ${gate.replace(/\s+/g, ' ').slice(0, 90)}`);
  assert.ok(/: undefined/.test(gate), '좌표가 없을 때 안 누르게 두지 않는다');
}

// ── 3. 없는 값에 기대지 않는다 ─────────────────────────────────────
//
// 주소는 새 경기에 안 저장한다(카카오 응답이고 쓰는 데가 없었다). 기존 경기에는
// 남아 있어서, 모달이 있으면 그리고 없으면 그 줄을 생략해야 한다.
//
// 지도 키도 마찬가지다. .env에 없으면 SDK가 appkey=undefined로 로드돼 조용히
// 실패하고 빈 상자가 남는다 — 「못 불러왔다」와 「원래 이런 화면」이 구별되지 않는다.
{
  assert.ok(/\{!!address && /.test(modal), '주소가 없을 때 빈 줄을 그린다');
  assert.ok(/const showMap = latitude != null && longitude != null/.test(modal), '좌표가 없을 때 지도를 그린다');
  assert.ok(/if \(!KAKAO_MAPS_JS_KEY\)/.test(modal), '지도 키가 없을 때 빈 상자를 그린다');

  // 길찾기는 키가 필요 없다 — 키가 없어도 이건 살아 있어야 한다
  assert.ok(/map\.kakao\.com\/link\/to/.test(modal), '길찾기 링크가 없다');
}

// ── 4. 지도가 안 뜰 때 무엇이 보이는가 ─────────────────────────────
//
// 실패 경로가 넷인데 전부 조용하다:
//   키 없음 · 스크립트 안 받아짐 · 받았는데 kakao.maps 없음(등록 안 된 도메인) ·
//   load 콜백이 안 불림
// 「키 없음」만 처리돼 있었고 나머지 셋이 빠져 있었다 — 그때 빈 상자가 남고
// 「못 불러왔다」와 「원래 이런 화면」의 출력이 같아진다. 이 세션 내내 잡아온 계열이다.
{
  const html = onlyMatch(modal, /function buildMapHtml[\s\S]*?\n\}/, 'buildMapHtml');
  // HTML 쪽이 실패를 알린다
  assert.ok(/ReactNativeWebView\.postMessage\('mapfail:'/.test(html), '지도 실패를 RN에 안 알린다');
  for (const why of ['script-load', 'no-sdk', 'timeout', 'render']) {
    assert.ok(html.includes(`'${why}'`), `실패 경로 ${why}를 안 잡는다`);
  }
  // window.onerror가 SDK 스크립트 안의 오류를 잡는다 — try/catch로는 안 잡힌다
  assert.ok(/window\.onerror = /.test(html), 'SDK 내부 오류를 안 잡는다');
  // 성공하면 타임아웃이 나중에 실패를 못 부르게 막아야 한다
  assert.ok(/reported = true;/.test(html), '성공 뒤에도 타임아웃이 실패를 부른다');

  // RN 쪽이 받아서 폴백으로 떨어진다
  /* 「onMessage=」로 보면 xonMessage= 같은 오타에도 걸린다 — 속성 경계까지 본다 */
  assert.ok(/\s onMessage=\{\(e\) =>/.test(modal.replace(/\r?\n/g, ' ')), 'WebView가 메시지를 안 받는다');
  assert.ok(/if \(mapFailed\) return fallback\(/.test(modal), '실패해도 폴백으로 안 떨어진다');
  assert.ok(/onError=\{\(\) => setMapFailed\(true\)\}/.test(modal), '네트워크 실패를 안 잡는다');
}

// ── 5. baseUrl이 있고 상수다 ───────────────────────────────────────
//
// html 문자열만 주면 문서가 about:blank가 되어 origin이 없다. 그러면 카카오 콘솔에
// 도메인을 아무리 등록해도 소용이 없다 — 보낼 도메인이 없다.
// 그리고 이 값은 콘솔 등록과 짝이라 하드코딩하면 어디를 고쳐야 하는지가 안 보인다.
{
  assert.ok(/const MAP_BASE_URL = /.test(modal), 'baseUrl이 상수가 아니다');
  assert.ok(/baseUrl: MAP_BASE_URL/.test(modal), 'WebView에 baseUrl을 안 넘긴다 — origin이 없어 도메인 등록이 무의미하다');
  // 그 값이 콘솔 등록과 맞춰야 한다는 것을 주석이 말해야 한다
  const around = modal.slice(Math.max(0, modal.indexOf('const MAP_BASE_URL') - 1200), modal.indexOf('const MAP_BASE_URL'));
  assert.ok(/콘솔/.test(around), 'baseUrl 옆에 콘솔 등록과 맞춰야 한다는 근거가 없다');
}

console.log('placemap ok');
