/*
  장소 검색이 위치를 실제로 쓰는가, 그리고 못 썼을 때 그 사실을 말하는가.

  이 검사가 생긴 이유가 있다. 에뮬레이터에서 「고양시·평택시·용산구」가 섞여
  나왔다. 코드가 위치를 안 쓰는 것처럼 보였는데, 재보니 배선은 서버까지 다
  이어져 있었다 — Edge Function이 x·y·radius·sort를 넘기고, 클라이언트도
  coords를 넘기게 돼 있었다. 끊긴 곳은 한 줄이었다: getCurrentPositionAsync가
  던졌고 async IIFE에 catch가 없어서 setCoords가 영영 안 불렸다.

  그래서 이 검사는 「위치를 쓰는가」만 보지 않는다. 실패했을 때 화면이 그 사실을
  말하는지까지 본다 — 말하지 않으면 「내 주변으로 찾았다」와 「위치를 못 얻어
  전국으로 찾았다」의 출력이 같아지고, 그게 원래 못 봤던 이유다.
*/
import { readFileSync } from 'node:fs';
import { onlyMatch } from './lib/anchor';

const MODAL = 'src/features/attendance/components/PlaceSearchModal.tsx';
const FN = 'supabase/functions/search-places/index.ts';

const modal = readFileSync(MODAL, 'utf8');
const fn = readFileSync(FN, 'utf8');

/** 주석을 걷어낸 코드. 근거 주석에는 옛 이름(locationDenied)이 일부러 남아 있다. */
const code = modal
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const fails: string[] = [];
const ok = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };

// ── ① 서버가 좌표를 실제로 카카오에 넘긴다 ──
for (const p of ['x', 'y', 'radius', 'sort']) {
  ok(fn.includes("params.set('" + p + "'"), `search-places가 ${p}를 안 넘긴다`);
}
ok(fn.includes("'sort', 'distance'"), 'sort가 distance가 아니다');

// ── ② 클라이언트가 좌표를 넘긴다 ──
ok(/searchPlaces\(trimmed,\s*coords\s*\?\?\s*undefined\)/.test(code),
   '첫 검색에 coords를 안 넘긴다 — 넘기지 않으면 서버의 ①이 죽은 코드가 된다');

// ── ③ 측위 실패가 삼켜지지 않는다 ──
ok(/catch\s*\{[\s\S]{0,120}setLocationState\('unavailable'\)/.test(code),
   '측위가 던질 때 catch에서 unavailable로 안 넘어간다 — 옛 결함이 돌아왔다');
ok(/accuracy:\s*Location\.Accuracy\.Balanced/.test(code),
   '최고 정확도 기본값으로 돌아갔다 — 실내에서 안 잡힌다');
ok(/getLastKnownPositionAsync/.test(code), '마지막 위치 폴백이 없다');
ok(/Promise\.race/.test(code), '타임아웃이 없다 — 측위를 무한정 기다린다');

// ── ④ 네 상태가 각각 다른 말을 한다 ──
//    셋을 한 문구로 합치면 이 검사가 잡는다.
const hints = [
  ["locationState === 'denied'", '위치 권한이 없어서'],
  ["locationState === 'unavailable'", '위치를 확인할 수 없어'],
  ['widened', '20km 안에는 없어서'],
] as const;
for (const [guard, text] of hints) {
  ok(modal.includes(guard), `${guard} 갈래가 사라졌다`);
  ok(modal.includes(text), `「${text}…」 안내가 사라졌다`);
}
// 세 문구가 서로 달라야 한다 — 같으면 갈래가 있어도 구별이 안 된다.
const texts = hints.map(([, t]) => t);
ok(new Set(texts).size === texts.length, '안내 문구가 겹친다');

// ── ⑤ 0건 폴백이 있다 ──
ok(/places\.length === 0 && coords/.test(code), '반경 안에 0건일 때의 폴백이 없다');
ok(/await searchPlaces\(trimmed\)\s*;?/.test(code), '폴백이 위치 없이 다시 찾지 않는다');
ok(/setWidened\(nationwide\.length > 0\)/.test(code),
   '넓혔다는 사실을 0건일 때까지 켜면 「없어서 전국에서 찾았는데 그것도 없음」에 엉뚱한 안내가 붙는다');

// ── ⑥ widened와 locationState를 한 상태로 합치지 않았다 ──
//    합치면 「위치는 얻었는데 0건이라 넓혔다」를 표현할 수 없다.
ok(/const \[widened, setWidened\] = useState/.test(code), 'widened가 별도 상태가 아니다');
ok(onlyMatch(code, /type LocationState = [^\n]+/).includes("'ok'"),
   'LocationState에 ok가 없다');
ok(!/'widened'/.test(onlyMatch(code, /type LocationState = [^\n]+/)),
   'widened를 LocationState에 섞었다 — 축이 다르다');

if (fails.length) {
  console.error(fails.map((f) => '  ✗ ' + f).join('\n'));
  process.exit(1);
}
