// src/features/settlement/account.ts
// 입금 계좌가 정산을 만들 수 있는 상태인지.
//
// 이 판정이 두 곳에 따로 있었다:
//   CreateSettlementSheet — 금액만 봤다. 그래서 계좌가 없어도 버튼이 「정산 링크 생성」으로 켜졌다
//   SettlementScreen      — 제출에서 계좌를 보고 조용히 return 했다
// 결과는 "눌리는 버튼을 눌렀는데 아무 일도 안 일어남"이었다. 둘이 같은 함수를 보게 한다.
//
// RN에 기대지 않는 순수 모듈이라 스크립트에서 그대로 부를 수 있다.

export interface AccountView {
  bank: string;
  no: string;
  holder: string;
}

export function isAccountComplete(a: AccountView): boolean {
  return !!a.bank.trim() && !!a.no.trim() && !!a.holder.trim();
}

/**
 * 정산 생성 버튼에 적을 말.
 * 못 누르는 이유가 있으면 그 이유를 적는다 — 버튼이 왜 안 먹는지 화면에서 알 수 있어야 한다.
 */
export function createCtaLabel(p: { total: number; attendeeCount: number; account: AccountView }): string {
  if (p.total <= 0) return '총 비용을 입력해주세요';
  if (p.attendeeCount === 0) return '정산할 참석자가 없어요';
  if (!isAccountComplete(p.account)) return '입금 계좌를 먼저 등록해주세요';
  return '정산 링크 생성';
}

export function canCreateSettlement(p: { total: number; attendeeCount: number; account: AccountView }): boolean {
  return createCtaLabel(p) === '정산 링크 생성';
}
