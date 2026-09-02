// scripts/sendapp.check.ts — 송금 딥링크 조립·차단 검증
//
//   node --experimental-strip-types scripts/sendapp.check.ts
//
// 이 저장소에는 테스트 러너가 없다. 여기는 돈이 나가는 길목이라 조용히 틀리면
// 사람이 엉뚱한 계좌나 빈 금액으로 송금 화면을 마주한다. 앱을 켜지 않고 확인해 둔다.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SEND_APPS, directSend } from '../src/features/settlement/sendApps.ts';

/* 이스케이프를 쓰지 않는다 — 이 저장소에서 문자열이 셸을 두 번 지나가며 열 번 넘게 샜다 */
const BS = String.fromCharCode(92);
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ACCOUNT = { bankName: '국민은행', accountNo: '12345601234567', amount: 12000 };

// ── 기억해 둔 앱으로 바로 열기 ──────────────────────────
const toss = directSend('toss', ACCOUNT);
assert.ok(toss, '기억해 둔 앱이 목록에 있으면 바로 열 대상이 나와야 한다');
assert.equal(toss.app.name, '토스');
assert.equal(
  toss.url,
  'supertoss://send?bank=%EA%B5%AD%EB%AF%BC%EC%9D%80%ED%96%89&accountNo=12345601234567&amount=12000',
  '은행명은 인코딩되고 계좌·금액이 그대로 실려야 한다'
);

// 금액을 지원하지 않는 앱도 계좌까지는 채운다
const kb = directSend('kb', ACCOUNT);
assert.ok(kb);
assert.equal(kb.url, 'kbbank://transfer?accountNo=12345601234567');

// ── 시트로 떨어져야 하는 경우 ───────────────────────────
assert.equal(directSend(null, ACCOUNT), null, '기억해 둔 앱이 없으면 시트를 열어 고르게 한다');
assert.equal(directSend('bithumb', ACCOUNT), null, '목록에 없는 id(앱을 뺀 뒤 남은 설정)면 시트로 간다');
assert.equal(directSend('toss', { ...ACCOUNT, accountNo: '' }), null, '계좌가 비면 빈 딥링크를 열지 않는다');
assert.equal(directSend('toss', { ...ACCOUNT, bankName: null }), null, '은행명이 없어도 열지 않는다');
assert.equal(directSend('toss', { ...ACCOUNT, amount: 0 }), null, '금액 0원짜리 송금 화면은 열지 않는다');
assert.equal(directSend('toss', { ...ACCOUNT, amount: -1 }), null, '음수 금액도 막는다');

// ── 목록 자체의 최소 조건 ───────────────────────────────
assert.equal(new Set(SEND_APPS.map((a) => a.id)).size, SEND_APPS.length, 'id가 겹치면 기억한 앱을 못 찾는다');
for (const a of SEND_APPS) {
  const url = a.buildUrl({ bankName: '신한', accountNo: '110123456789', amount: 9000 });
  assert.ok(url.includes('110123456789'), `${a.name}: 딥링크에 계좌번호가 빠졌다`);
  assert.ok(/^[a-z][a-z0-9+.-]*:\/\//.test(url), `${a.name}: 스킴 모양이 아니다 (${url})`);
}

// ── 시트를 그리는 곳이 그것을 열 수 있는가 ─────────────────────────
//
// 2026-09-02에 재서 안 것. **홈이 SendMoneySheet를 그리는데 열 수가 없었다** —
// `visible={sendOpen}`은 있고 `setSendOpen(true)`가 어디에도 없었다.
// 9bd4f0b이 홈의 액션 셋을 의도적으로 걷어내면서 시트만 남긴 것이다.
//
// 그래서 「홈에서 송금하면 돌아와도 입금 확인을 안 묻는다」로 읽었던 것은 **틀렸다.**
// 홈에서는 송금을 시작할 수가 없었다. 프롭이 안 넘어간 것은 사실이지만
// 증상은 그게 아니었다 — **죽은 UI**였다. 「부르는 자리가 없다」 계열의 세 번째다
// (독촉 버튼 · remindNotVoted · 이 시트).
//
// ⚠ 이 단언은 **여는 자리**를 본다. 「프롭을 넘기는가」는 타입이 본다 —
//   onCopied·onOpened를 필수로 바꿨으므로 안 넘기면 tsc가 막는다.
//   검사와 타입이 같은 것을 두 번 묻지 않게 나눈다.
{
  const files: string[] = [];
  (function walk(d: string) {
    for (const n of readdirSync(d)) {
      const q = join(d, n);
      if (statSync(q).isDirectory()) walk(q);
      else if (n.endsWith('.tsx')) files.push(q.split(BS).join('/'));
    }
  })('src');

  const renderers: string[] = [];
  for (const f of files) {
    if (f.endsWith('SendMoneySheet.tsx')) continue; // 정의부는 뺀다
    const src = strip(readFileSync(f, 'utf8'));
    if (!/<SendMoneySheet[\s>]/.test(src)) continue;
    renderers.push(f);

    // visible에 물린 상태 이름을 뽑아, 그것을 true로 켜는 자리가 있는지 본다
    const bound = src.match(/<SendMoneySheet[\s\S]{0,200}?visible=\{([A-Za-z_$][\w$]*)\}/);
    assert.ok(bound, `${f}: SendMoneySheet의 visible이 상태에 안 물려 있다`);
    const setter = 'set' + bound![1][0].toUpperCase() + bound![1].slice(1);
    assert.ok(
      new RegExp(`${setter}\\(true\\)`).test(src),
      `${f}: 시트를 그리는데 ${setter}(true)가 없다 — 열 수 없는 시트다. 지우거나 여는 자리를 붙여라`
    );
  }
  assert.ok(renderers.length > 0, 'SendMoneySheet를 그리는 곳이 하나도 없다 — 송금 길이 끊겼다');
}

console.log('sendapp.check: ok');
