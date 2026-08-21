// src/features/attendance/utils/createResult.ts
// 반복 생성 결과 문구.
//
// 화면(.tsx) 안에 두면 검사 스크립트가 못 부른다 — node가 .tsx를 못 읽는다.
// 문구 규칙은 눈으로 확인하기 어려운 종류라(셋/넷 경계, 전부 겹친 경우)
// assert로 잡을 수 있는 자리에 둔다.

export interface CreateResult {
  created: number;
  /** 이미 있어서 건너뛴 경기의 ISO 날짜들 */
  skipped: string[];
}

/**
 * 「10건 만들었어요 · 9/3, 9/17은 이미 있어 건너뛰었어요」
 *
 * 건너뛴 날짜를 셋까지 적는다. 개수만 말하면 총무가 어느 주가 빠졌는지 확인하러
 * 캘린더를 훑어야 한다 — 그게 이 안내를 두는 이유다.
 * 넷부터는 문장이 화면을 덮으므로 개수로 요약한다.
 */
export function createResultLabel(r: CreateResult): string {
  const md = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  if (r.created === 0) return '모두 이미 있는 날짜라 새로 만든 경기가 없어요';
  if (r.skipped.length === 0) return `${r.created}건 만들었어요`;
  const tail =
    r.skipped.length <= 3
      ? `${r.skipped.map(md).join(', ')}은 이미 있어 건너뛰었어요`
      : `${r.skipped.length}건은 이미 있어 건너뛰었어요`;
  return `${r.created}건 만들었어요 · ${tail}`;
}
