// src/features/settlement/sendApps.ts — 송금 앱 목록과 "바로 열지 말지" 판단
//
// react-native에 의존하지 않는 순수 모듈로 둔다 — links.ts와 같은 이유로,
// 딥링크에 계좌·금액이 제대로 실리는지를 앱을 켜지 않고 검증할 수 있어야 한다.
// (scripts/sendapp.check.ts)

export interface SendApp {
  id: string;
  name: string;
  mark: string;
  bg: string;
  fg: string;
  tag?: string;
  meta: string;
  /** 계좌/금액을 채운 딥링크. 앱별로 지원 범위가 다르다. */
  buildUrl: (p: { bankName: string; accountNo: string; amount: number }) => string;
}

/** 스킴은 프로젝트에서 실기기 테스트 후 확정하세요. */
export const SEND_APPS: SendApp[] = [
  {
    id: 'toss',
    name: '토스',
    mark: 'T',
    bg: 'rgba(49,116,255,0.14)',
    fg: '#5B94FF',
    tag: '가장 빠름',
    meta: '계좌·금액 자동 입력',
    buildUrl: ({ bankName, accountNo, amount }) =>
      `supertoss://send?bank=${encodeURIComponent(bankName)}&accountNo=${accountNo}&amount=${amount}`,
  },
  {
    id: 'kakaobank',
    name: '카카오뱅크',
    mark: 'k',
    bg: 'rgba(254,229,0,0.16)',
    fg: '#FEE500',
    meta: '계좌·금액 자동 입력',
    buildUrl: ({ accountNo, amount }) => `kakaobank://transfer?accountNo=${accountNo}&amount=${amount}`,
  },
  {
    id: 'kb',
    name: 'KB국민은행',
    mark: 'KB',
    bg: 'rgba(255,188,0,0.12)',
    fg: '#E0A82E',
    meta: '계좌 자동 입력 · 금액 직접 확인',
    buildUrl: ({ accountNo }) => `kbbank://transfer?accountNo=${accountNo}`,
  },
  {
    id: 'shinhan',
    name: '신한은행',
    mark: 'S',
    bg: 'rgba(0,101,180,0.14)',
    fg: '#5D9FD6',
    meta: '계좌 자동 입력 · 금액 직접 확인',
    buildUrl: ({ accountNo }) => `shinhan-sr-ansimclick://transfer?accountNo=${accountNo}`,
  },
];

/**
 * 앱 선택 시트를 건너뛰고 곧장 열 수 있는 송금 대상. 못 열면 null — 호출부는 시트로 떨어진다.
 *
 * 계좌나 금액이 비어 있으면 열지 않는다. 빈 값을 딥링크에 실어 보내면 송금 앱이
 * 받는 사람도 금액도 없는 화면을 열고, 사용자는 자기가 뭘 잘못 눌렀는지 알 수 없다.
 * 시트로 보내면 최소한 계좌 복사까지는 갈 수 있다.
 */
export function directSend(
  rememberedId: string | null,
  p: { bankName?: string | null; accountNo?: string | null; amount: number }
): { app: SendApp; url: string } | null {
  if (!rememberedId || !p.bankName || !p.accountNo || p.amount <= 0) return null;
  const app = SEND_APPS.find((a) => a.id === rememberedId);
  if (!app) return null;
  return { app, url: app.buildUrl({ bankName: p.bankName, accountNo: p.accountNo, amount: p.amount }) };
}
