// scripts/sendapp.check.ts — 송금 딥링크 조립·차단 검증
//
//   node --experimental-strip-types scripts/sendapp.check.ts
//
// 이 저장소에는 테스트 러너가 없다. 여기는 돈이 나가는 길목이라 조용히 틀리면
// 사람이 엉뚱한 계좌나 빈 금액으로 송금 화면을 마주한다. 앱을 켜지 않고 확인해 둔다.
import assert from 'node:assert/strict';
import { SEND_APPS, directSend } from '../src/features/settlement/sendApps.ts';

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

console.log('sendapp.check: ok');
