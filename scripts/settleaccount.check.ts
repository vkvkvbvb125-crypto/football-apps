// scripts/settleaccount.check.ts — 정산 생성 게이트
//
// 버그: 「계좌 미등록」인데 버튼은 「정산 링크 생성」으로 켜져 있었고, 누르면
// 화면 쪽 제출이 if (!isAccountComplete) return; 으로 조용히 삼켰다.
// 판정이 시트(금액만)와 화면(계좌까지) 두 곳에 따로 있어서 생긴 일이다.
import assert from 'node:assert/strict';
import { isAccountComplete, createCtaLabel, canCreateSettlement } from '../src/features/settlement/account.ts';

const full = { bank: '카카오뱅크', no: '3333-01-1234567', holder: '김범준' };
const none = { bank: '', no: '', holder: '' };

assert.equal(isAccountComplete(full), true);
assert.equal(isAccountComplete(none), false);
// 공백만 있는 것도 미등록이다
assert.equal(isAccountComplete({ bank: ' ', no: ' ', holder: ' ' }), false);
// 셋 중 하나라도 비면 안 된다
assert.equal(isAccountComplete({ ...full, holder: '' }), false);
assert.equal(isAccountComplete({ ...full, no: '' }), false);
assert.equal(isAccountComplete({ ...full, bank: '' }), false);

// 신고된 그 상황: 금액 120,000 · 참석 1명 · 계좌 미등록
const reported = { total: 120000, attendeeCount: 1, account: none };
assert.equal(canCreateSettlement(reported), false, '계좌 없이 생성이 가능하면 안 된다');
assert.equal(createCtaLabel(reported), '입금 계좌를 먼저 등록해주세요', '버튼이 이유를 말해야 한다');
// 옛 동작(금액만 보고 켜짐)으로 돌아가지 않았는지
assert.notEqual(createCtaLabel(reported), '정산 링크 생성');

// 이유가 여럿이면 먼저 막히는 것부터 말한다
assert.equal(createCtaLabel({ total: 0, attendeeCount: 1, account: none }), '총 비용을 입력해주세요');
assert.equal(createCtaLabel({ total: 120000, attendeeCount: 0, account: full }), '정산할 참석자가 없어요');

// 다 갖춰지면 통과
const ok = { total: 120000, attendeeCount: 1, account: full };
assert.equal(createCtaLabel(ok), '정산 링크 생성');
assert.equal(canCreateSettlement(ok), true);

console.log('settleaccount.check: ok');
