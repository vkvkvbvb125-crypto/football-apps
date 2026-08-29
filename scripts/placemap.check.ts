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

console.log('placemap ok');
