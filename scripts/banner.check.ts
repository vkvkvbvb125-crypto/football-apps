// scripts/banner.check.ts — 배너에 무엇이 올라가는가
//
// 화면으로는 잘 안 갈린다. 슬라이드가 빠졌는지 그냥 안 넘어간 건지, D-day가 하루 틀렸는지는
// 눈으로 못 본다. 조건이 다섯 갈래라 여기서 돌린다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBannerSlides } from '../src/features/home/components/bannerSlides';

const NOW = new Date(2026, 7, 24, 15, 0, 0); // 2026-08-24 15:00
const at = (y: number, m: number, d: number, h = 19) => new Date(y, m - 1, d, h).toISOString();
const kinds = (s: ReturnType<typeof buildBannerSlides>) => s.map((x) => x.kind).join(',');
const stat = (s: ReturnType<typeof buildBannerSlides>, i: number) => {
  const x = s[i];
  assert.equal(x.kind, 'stat', `${i}번이 stat이 아니다`);
  return x as Extract<typeof x, { kind: 'stat' }>;
};

// ── 1. 값이 없으면 그 슬라이드는 빠진다 ─────────────────────────────
// 「-」로 자리를 채우면 넘길수록 빈 화면만 나오는 캐러셀이 된다.
{
  const s = buildBannerSlides({ thisMonth: { rate: null }, lastMonth: { rate: null }, nextMatch: null, now: NOW });
  assert.equal(kinds(s), 'brand', `참석률도 경기도 없는데 ${kinds(s)}`);
  assert.equal(s.length, 1, '한 장만 남아야 배너가 정적으로 선다');
}

// ── 2. 참석률만 있을 때 ─────────────────────────────────────────────
{
  const s = buildBannerSlides({ thisMonth: { rate: 0.67 }, lastMonth: { rate: 0.5 }, nextMatch: null, now: NOW });
  assert.equal(kinds(s), 'brand,stat');
  assert.equal(stat(s, 1).value, '67%');
  assert.equal(stat(s, 1).sub, '지난달보다 +17%p', '증감 부호나 단위가 틀렸다');
}

// ── 3. 지난달 기준선이 없으면 증감을 말하지 않는다 ──────────────────
// 0%p라고 적으면 「그대로」라는 거짓말이 된다. 지난달엔 잰 적이 없다.
{
  const s = buildBannerSlides({ thisMonth: { rate: 0.67 }, lastMonth: { rate: null }, nextMatch: null, now: NOW });
  assert.equal(stat(s, 1).sub, undefined, '기준선이 없는데 증감을 적는다');
}
{
  const s = buildBannerSlides({ thisMonth: { rate: 0.5 }, lastMonth: { rate: 0.5 }, nextMatch: null, now: NOW });
  assert.equal(stat(s, 1).sub, '지난달과 같아요', '같을 때 0%p로 적는다');
}
{
  const s = buildBannerSlides({ thisMonth: { rate: 0.4 }, lastMonth: { rate: 0.6 }, nextMatch: null, now: NOW });
  assert.equal(stat(s, 1).sub, '지난달보다 -20%p', '내려갔을 때 부호가 없다');
}

// ── 4. D-day는 자정 기준으로 센다 ───────────────────────────────────
// 시각까지 넣으면 오늘 저녁 경기가 반올림에 따라 D-1로도 보인다.
{
  const cases: [string, string][] = [
    [at(2026, 8, 24, 19), 'D-DAY'], // 오늘 저녁 — 지금(15시)보다 뒤지만 같은 날
    [at(2026, 8, 24, 9), 'D-DAY'], // 오늘 오전 — 이미 지났어도 오늘은 오늘이다
    // 내일 새벽 — 시각으로 빼면 11시간이라 반올림이 0(D-DAY)으로 떨어진다.
    // 저녁 경기만 시험하면 자정 기준인지 시각 기준인지 구분이 안 된다(변이가 여기로 샜다).
    [at(2026, 8, 25, 2), 'D-1'],
    [at(2026, 8, 25, 19), 'D-1'],
    [at(2026, 8, 31, 19), 'D-7'],
    [at(2026, 9, 1, 19), 'D-8'], // 달을 넘어가도 일수로 센다
    [at(2026, 8, 23, 19), 'D+1'], // 유예 구간에 걸린 지난 경기
  ];
  for (const [iso, expected] of cases) {
    const s = buildBannerSlides({ thisMonth: { rate: null }, lastMonth: { rate: null }, nextMatch: { matchDate: iso }, now: NOW });
    assert.equal(stat(s, 1).value, expected, `${iso} → ${stat(s, 1).value} (기대 ${expected})`);
  }
}

// ── 5. 순서와 장소 ──────────────────────────────────────────────────
{
  const s = buildBannerSlides({
    thisMonth: { rate: 0.67 }, lastMonth: { rate: 0.5 },
    nextMatch: { matchDate: at(2026, 8, 26), location: '강남 풋살장' }, now: NOW,
  });
  assert.equal(kinds(s), 'brand,stat,stat', '브랜드가 맨 앞이 아니다');
  assert.equal(stat(s, 2).sub, '강남 풋살장');
  // 장소가 없어도 슬라이드는 남는다 — D-day가 본문이지 장소가 본문이 아니다
  const s2 = buildBannerSlides({ ...{ thisMonth: { rate: null }, lastMonth: { rate: null } }, nextMatch: { matchDate: at(2026, 8, 26), location: null }, now: NOW });
  assert.equal(kinds(s2), 'brand,stat');
  assert.equal(stat(s2, 1).sub, undefined);
}

// ── 6. 광고는 아직 배열에 없다 ──────────────────────────────────────
// 타입과 슬롯만 두기로 했다. 실수로 켜지면 심사와 무관하게 사용자가 먼저 본다.
{
  const s = buildBannerSlides({
    thisMonth: { rate: 0.67 }, lastMonth: { rate: 0.5 },
    nextMatch: { matchDate: at(2026, 8, 26) }, now: NOW,
  });
  assert.ok(!s.some((x) => x.kind === 'ad'), '광고 슬라이드가 배열에 들어갔다');

  const slot = readFileSync(new URL('../src/features/home/components/HomeBanner.tsx', import.meta.url), 'utf8');
  assert.ok(/export function AdSlot[\s\S]{0,200}?return null;/.test(slot), 'AdSlot이 null을 안 돌려준다');
}

// ── 7. 배너 자체의 불변식 ───────────────────────────────────────────
{
  const src = readFileSync(new URL('../src/features/home/components/HomeBanner.tsx', import.meta.url), 'utf8');

  // 한 장이면 자동 전환도 인디케이터도 없다
  assert.ok(/count > 1 &&/.test(src), '슬라이드가 하나여도 자동 전환이 돈다');
  assert.ok(/\{count > 1 && \(/.test(src), '슬라이드가 하나여도 점을 그린다');

  /*
   * 자동 전환 조건 자체를 본다.
   *
   * 「파일에 isFocused가 있는가」로는 안 된다 — 선언만 남기고 조건에서 빼도 통과한다.
   * 변이 시험에서 실제로 그렇게 샜다.
   */
  const autoExpr = src.match(/const auto = ([^;]+);/);
  assert.ok(autoExpr, '자동 전환 조건을 못 찾음');
  for (const [needle, why] of [
    ['isFocused', '포커스를 잃어도 계속 돈다 — 돌아왔을 때 엉뚱한 슬라이드에 있다'],
    ['reduceMotion', '「동작 줄이기」를 켜도 계속 돈다'],
    ['suspended', '손으로 민 뒤에도 곧바로 다시 돈다'],
  ] as const) {
    assert.ok(autoExpr![1].includes(needle), `자동 전환 조건에 ${needle}이 없다 — ${why}`);
  }
  /*
    「동작 줄이기」는 이제 배너가 직접 읽지 않는다 — src/lib/useReduceMotion.ts가 읽고,
    일정 화면의 명단 시트도 같은 훅을 쓴다. 「배너 파일에 isReduceMotionEnabled가 있는가」로는
    훅을 부르면서 값을 안 쓰는 상태를 못 잡으므로, 값을 만드는 줄을 양쪽에서 집어 본다.
  */
  assert.ok(/const reduceMotion = useReduceMotion\(\);/.test(src), '배너가 「동작 줄이기」 훅을 부르지 않는다');
  const hook = readFileSync(new URL('../src/lib/useReduceMotion.ts', import.meta.url), 'utf8');
  assert.ok(hook.includes('isReduceMotionEnabled'), '훅이 「동작 줄이기」를 읽지 않는다');
  assert.ok(
    hook.includes("addEventListener('reduceMotionChanged'"),
    '훅이 설정 변경을 구독하지 않는다 — 앱을 켠 뒤에 켜면 안 먹는다'
  );
  assert.ok(/sub\.remove\(\)/.test(hook), '훅이 구독을 해제하지 않는다');
  assert.ok(/return reduceMotion;/.test(hook), '훅이 읽은 값을 안 돌려준다 — 늘 false가 된다');
  // 세로 스크롤 중 전환 금지
  assert.ok(/if \(scrollingRef\?\.current\) return;/.test(src), '세로 스크롤 중에도 넘어간다');
  // 타이머 정리
  assert.ok(/return \(\) => clearInterval\(id\);/.test(src), 'interval을 정리하지 않는다');
  assert.ok(/clearTimeout\(resumeTimer\.current\)/.test(src), '재개 타이머를 정리하지 않는다');

  // 페이지에 flex를 주면 가로로 눌려서 인디케이터만 넘어가고 화면은 그대로가 된다.
  // 실제로 그렇게 만들었다가 잡았다.
  assert.ok(/page: \{ justifyContent: 'center' \}/.test(src), 'page 스타일에 flex가 다시 붙었다');

  const auto = src.match(/const AUTO_MS = (\d+)/);
  const resume = src.match(/const RESUME_MS = (\d+)/);
  assert.equal(auto?.[1], '5000', '자동 전환 간격이 5초가 아니다');
  assert.equal(resume?.[1], '10000', '재개까지가 10초가 아니다');
}

console.log('banner ok');
