/*
  정산의 큰 금액이 **몫의 합**에서 오는가.

  ── 왜 이 검사가 있나 ──────────────────────────────────────────────
  2026-09-19에 기기에서 정산 상세가 이렇게 떠 있었다:

      참석 1명 · 1인당 10,000원
      20,000원

  **1 × 10,000 ≠ 20,000이다.** 세 숫자가 각자 다른 데서 와서 모순이 그냥 통과했다:

      참석 N명    settlement.shares.length      (몫)
      1인당 M원   settlement.per_person         (만들 때 계산해 저장한 값)
      총액        settlement.total_amount       (총무가 **입력한** 경기 비용)

  DB에서 역추적했다. `surplus = per_person × count − total`이 0이므로
  **2인으로 만들어졌는데** `settlement_shares`에 행이 **하나뿐**이었다.
  즉 만든 뒤 몫이 하나 사라졌고, 화면은 그걸 모른 채 세 숫자를 나란히 찍었다.

  ⚠ **데이터 탓으로 넘길 일이 아니다.** 화면이 「N명 × 1인당 = 총액」이라는 관계를
    **주장하면서 검산하지 않는** 것이 결함이다. 어떤 경로로든 몫이 바뀌면 또 갈린다.

  ── 이 검사가 보는 것 ─────────────────────────────────────────────
  ⑴ 큰 금액 자리(`styles.amountTotal`)가 `sharesTotal`을 찍는다 —
     `totalAmount`가 아니다. 그러면 「N명 × 1인당 M원 = 이 금액」이 늘 성립한다.
  ⑵ 둘이 갈릴 때 **차이를 적는다** — 숨기면 돈이 빈 것을 아무도 모른다.
  ⑶ `sharesTotal`을 만드는 자리가 **하나**다 (스토어의 mapSettlement).
     화면에서 몫을 다시 더하면 그 순간 출처가 둘이 된다.

  ⚠ 못 보는 것: 몫이 사라지는 **원인**. 그건 DB 쪽 이야기고 이 검사는 화면만 본다.
*/
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').split('\r').join('');

/* ── ⑴⑵ 패널이 몫의 합을 찍고, 갈리면 차이를 적는가 ──────────────── */
{
  const panel = read('src/features/settlement/components/SettlementProgressPanel.tsx');

  const big = /<Text style=\{styles\.amountTotal\}>\{([A-Za-z.]+)\.toLocaleString\(\)\}원<\/Text>/.exec(panel);
  assert.ok(big, 'SettlementProgressPanel에서 큰 금액 줄을 못 찾았다 — 모양이 바뀌었으면 이 검사도 고쳐라');
  assert.equal(
    big[1],
    'sharesTotal',
    `큰 금액 자리가 «${big[1]}»에서 온다 — **몫의 합(sharesTotal)**이어야 한다. ` +
      `totalAmount는 총무가 입력한 값이라 옆의 「N명」·「1인당 M원」과 출처가 달라 ` +
      `서로 안 맞을 수 있다(2026-09-19에 「참석 1명 · 1인당 10,000원 / 20,000원」으로 실제로 갈렸다)`
  );

  assert.ok(
    /sharesTotal !== totalAmount/.test(panel),
    '몫의 합과 입력한 비용이 갈릴 때를 안 본다 — 조용히 맞는 것처럼 보이면 ' +
      '돈이 빈 것을 총무가 모른다. 차이를 적어라'
  );
}

/* ── ⑶ sharesTotal을 만드는 자리가 하나인가 ─────────────────────── */
{
  /*
    ⚠ **처음에 「몫의 금액을 더하는 곳」을 전부 막으려다 틀렸다.**
      HomeScreen의 `shares.filter(!paid).reduce(+amount)`가 걸렸는데
      그건 **미납 금액**이라 전혀 다른 사실이다. 합산이라는 모양이 같을 뿐이다.
      막을 것은 「합산」이 아니라 **`sharesTotal`이라는 같은 값을 두 번 만드는 것**이다.
  */
  const walk = (d: string, out: string[] = []): string[] => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) {
        if (!p.includes('__tests__')) walk(p, out);
      } else if (/\.tsx?$/.test(n)) out.push(p);
    }
    return out;
  };

  const producers: string[] = [];
  for (const file of walk('src')) {
    const src = readFileSync(file, 'utf8').split('\r').join('');
    /*
      값을 **만드는** 두 꼴만 센다:
        const/let sharesTotal = …        계산해서 변수에 담는다
        sharesTotal: ( …                 객체에 계산식으로 넣는다 (스토어의 꼴)

      ⚠ **JSX 프롭 전달은 만드는 것이 아니다.** 처음에 `sharesTotal\s*=\s*[^=]`로
        썼더니 `sharesTotal={settlement.sharesTotal}` 한 줄이 걸려서, 내가 방금 쓴
        줄을 위반으로 읽었다. 타입 선언(`sharesTotal: number;`)도 값이 아니다.
    */
    if (/(?:const|let)\s+sharesTotal\s*=/.test(src) || /sharesTotal:\s*\(/.test(src)) {
      producers.push(`${file.split(sep).join('/')}`);
    }
  }
  const unique = [...new Set(producers)];
  assert.deepEqual(
    unique,
    ['src/features/settlement/stores/settlementStore.ts'],
    `sharesTotal을 만드는 자리가 하나가 아니다 — 같은 값을 두 번 계산하면 또 갈린다. ` +
      `스토어의 mapSettlement 한 곳에서만 만들어라:\n  ${unique.join('\n  ')}`
  );

  const store = read('src/features/settlement/stores/settlementStore.ts');
  assert.ok(
    /\.filter\(\(r: any\) => !r\.exempt\)/.test(store),
    'sharesTotal이 면제를 빼지 않는다 — 면제는 안 걷는 돈이다'
  );
}

console.log('settleamount ✓ 큰 금액은 몫의 합 · 갈리면 차이를 적는다 · 합은 한 곳에서 만든다');
