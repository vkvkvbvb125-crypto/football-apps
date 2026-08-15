// src/features/settlement/links.ts — 정산 딥링크 생성/파싱/공유
// settlement-flow.md 「딥링크」 참고. 링크는 송금을 수행하지 않는다 — 해당 정산 상세를 열 뿐이다.
import { Share } from 'react-native';
import * as Linking from 'expo-linking';
import type { Settlement } from './stores/settlementStore';

/** 배포용 링크의 뿌리. 유니버설 링크(iOS)·앱 링크(Android)가 이 도메인에 걸린다. */
export const WEB_BASE = 'https://kickday.app';

/**
 * 경로가 `/pay/`가 아니라 `/s/`인 이유:
 * 킥데이는 결제를 처리하지 않는다(settlement-flow.md 「앱 역할의 경계」).
 * 주소에 pay가 들어가면 그 페이지에서 결제가 일어나는 것처럼 읽힌다.
 *
 * 한번 카톡으로 나간 주소는 영원히 남으므로 바꾸기 어렵다 — 처음부터 사실과 맞춰 둔다.
 */
const SETTLEMENT_PATH = 's';

/**
 * 공유용 정산 링크. 받은 사람이 누르면 앱이 열리고 그 정산 상세가 뜬다.
 *
 * 개발 중에는 이 기기에서 실제로 열리는 주소(localhost / exp://)를 쓴다 —
 * https://kickday.app을 쓰면 개발 기기에서는 앱이 아니라 진짜 웹사이트가 열려 확인할 수 없다.
 */
export function settlementLink(id: string) {
  return __DEV__ ? Linking.createURL(`${SETTLEMENT_PATH}/${id}`) : `${WEB_BASE}/${SETTLEMENT_PATH}/${id}`;
}

/**
 * 파싱된 URL 조각에서 정산 id를 뽑는다. 정산 링크가 아니면 null.
 *
 * 들어오는 모양이 여러 가지다. 하나라도 놓치면 그 경로로 온 사람은 빈 화면을 본다:
 *   유니버설  https://kickday.app/s/abc      → hostname='kickday.app', path='s/abc'
 *   앱 스킴   kickday://s/abc                → hostname='s',           path='abc'
 *   개발      exp://10.0.0.2:8081/--/s/abc   → hostname='10.0.0.2',    path='s/abc'
 *   웹 개발   http://localhost:8082/s/abc    → hostname='localhost',   path='s/abc'
 *
 * 'settlement'도 계속 받는다 — 경로를 /s/로 줄이기 전에 나간 링크가 있을 수 있고,
 * 받아주는 비용이 한 줄이라 굳이 끊을 이유가 없다.
 *
 * expo-linking에 의존하지 않는 순수 함수로 두어 따로 검증할 수 있게 했다.
 */
const SETTLEMENT_SEGMENTS = ['s', 'settlement'];

export function settlementIdFromParsed(hostname: string | null, path: string | null): string | null {
  const segments = (path ?? '').split('/').filter(Boolean);
  // kickday://s/abc — 첫 조각이 hostname으로 떨어진 경우
  if (hostname && SETTLEMENT_SEGMENTS.includes(hostname)) return segments[0] ?? null;
  if (SETTLEMENT_SEGMENTS.includes(segments[0])) return segments[1] ?? null;
  return null;
}

/** 들어온 딥링크 URL에서 정산 id를 뽑는다. 정산 링크가 아니면 null. */
export function parseSettlementId(url: string): string | null {
  const parsed = Linking.parse(url);
  return settlementIdFromParsed(parsed.hostname ?? null, parsed.path ?? null);
}

/**
 * 공유 메시지. 링크만 담고 계좌번호·예금주는 넣지 않는다 (settlement-flow.md 「카톡 공유」).
 *
 * 계좌를 메시지에 박으면 단톡방에 평문으로 남고, 링크로 들어와야 보이는 "누가 얼마" 맥락도
 * 사라진다. 계좌는 링크를 눌러 들어온 상세 화면에서 보여준다.
 */
export function settlementShareMessage(s: Settlement, title: string) {
  return ['KickDay', title, `1인 ${s.perPerson.toLocaleString()}원`, '정산하기', settlementLink(s.id)].join('\n');
}

/** OS 공유 시트를 띄운다 — 사용자가 거기서 카카오톡을 고른다. */
export function shareSettlement(s: Settlement, title: string) {
  Share.share({ message: settlementShareMessage(s, title) }).catch(() => {
    // 사용자가 공유 시트를 닫은 경우 — 조용히 무시
  });
}
