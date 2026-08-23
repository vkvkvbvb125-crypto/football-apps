// src/features/team/regions.ts
// 활동 지역 — 법정동코드 시군구 5자리 체계.
//
// 코드 규칙: 앞 2자리 = 시도, 뒤 3자리 = 시군구. 뒤를 000으로 채우면 시도 레벨이다.
// 그래서 「부산 전체」는 26000이고, 나중에 26350(해운대구)을 넣어도 같은 체계 안이라
// 앞 2자리로 시도를 판별하는 로직이 그대로 동작한다.
//
// 별도 테이블이 아니라 상수 파일인 이유: 행정구역은 거의 바뀌지 않고(최근 10년에 몇 건),
// 전체가 6KB 남짓이다. 이만한 걸 위해 테이블·쿼리·로딩 상태를 만들 이유가 없다.
// 매칭에서 「같은 구 팀 찾기」를 할 때도 서버는 region_code로 거르면 되고,
// 이름 표시는 앱이 갖고 있으면 된다.
//
// ⚠ 지금은 전국을 다 담지 않는다. 검증이 동네 세 곳이고 매칭은 같은 지역에 20~30팀이
//   모여야 작동한다 — 부산 한 팀은 어차피 상대가 없다. 지방에 팀이 모이면 그때 추가한다.
//   체계가 표준이라 추가할 때 꼬이지 않는다.

export interface Region {
  /** 법정동코드 시군구 5자리 */
  code: string;
  /** 시/도 표시명 */
  sido: string;
  /** 시/군/구 표시명. 시도 전체를 뜻하면 '전체' */
  name: string;
}

/**
 * 어느 시도에도 속하지 않는 값.
 *
 * 앞 2자리 99는 실제 시도 코드에 없다 — 일부러 그런 값을 골랐다.
 * 다만 코드로 시도를 판별하는 로직은 이걸 따로 걸러야 한다(sidoCodeOf 참고).
 */
export const ETC_REGION_CODE = '99999';

export const REGIONS: Region[] = [
  // ── 서울특별시 (11) — 25개 구 전부
  { code: '11110', sido: '서울', name: '종로구' },
  { code: '11140', sido: '서울', name: '중구' },
  { code: '11170', sido: '서울', name: '용산구' },
  { code: '11200', sido: '서울', name: '성동구' },
  { code: '11215', sido: '서울', name: '광진구' },
  { code: '11230', sido: '서울', name: '동대문구' },
  { code: '11260', sido: '서울', name: '중랑구' },
  { code: '11290', sido: '서울', name: '성북구' },
  { code: '11305', sido: '서울', name: '강북구' },
  { code: '11320', sido: '서울', name: '도봉구' },
  { code: '11350', sido: '서울', name: '노원구' },
  { code: '11380', sido: '서울', name: '은평구' },
  { code: '11410', sido: '서울', name: '서대문구' },
  { code: '11440', sido: '서울', name: '마포구' },
  { code: '11470', sido: '서울', name: '양천구' },
  { code: '11500', sido: '서울', name: '강서구' },
  { code: '11530', sido: '서울', name: '구로구' },
  { code: '11545', sido: '서울', name: '금천구' },
  { code: '11560', sido: '서울', name: '영등포구' },
  { code: '11590', sido: '서울', name: '동작구' },
  { code: '11620', sido: '서울', name: '관악구' },
  { code: '11650', sido: '서울', name: '서초구' },
  { code: '11680', sido: '서울', name: '강남구' },
  { code: '11710', sido: '서울', name: '송파구' },
  { code: '11740', sido: '서울', name: '강동구' },

  // ── 경기도 (41) — 주요 시. 구가 있는 시도 시 단위까지만 담는다
  { code: '41110', sido: '경기', name: '수원시' },
  { code: '41130', sido: '경기', name: '성남시' },
  { code: '41170', sido: '경기', name: '안양시' },
  { code: '41190', sido: '경기', name: '부천시' },
  { code: '41270', sido: '경기', name: '안산시' },
  { code: '41280', sido: '경기', name: '고양시' },
  { code: '41460', sido: '경기', name: '용인시' },

  // ── 광역시 — 시 단위. 뒤 3자리 000이 시도 전체를 뜻한다
  { code: '26000', sido: '부산', name: '전체' },
  { code: '27000', sido: '대구', name: '전체' },
  { code: '28000', sido: '인천', name: '전체' },
  { code: '29000', sido: '광주', name: '전체' },
  { code: '30000', sido: '대전', name: '전체' },
  { code: '31000', sido: '울산', name: '전체' },

  { code: ETC_REGION_CODE, sido: '그 외', name: '지역' },
];

/** 선택 1단계 — 중복 없이 등장 순서대로 */
export const SIDO_LIST: string[] = REGIONS.reduce<string[]>((acc, r) => {
  if (!acc.includes(r.sido)) acc.push(r.sido);
  return acc;
}, []);

/** 선택 2단계 — 그 시도의 시/군/구 */
export function regionsOf(sido: string): Region[] {
  return REGIONS.filter((r) => r.sido === sido);
}

/** 시도 하나에 항목이 하나뿐이면 1단계에서 바로 정해진다 (광역시·그 외) */
export function isSingleEntry(sido: string): boolean {
  return regionsOf(sido).length === 1;
}

/**
 * 코드의 시도 부분(앞 2자리).
 *
 * 「그 외 지역」은 실제 시도가 아니므로 null이다 — 99를 시도 코드로 다루면
 * 지역 기반 조회에서 존재하지 않는 시도를 찾게 된다.
 */
export function sidoCodeOf(code: string | null | undefined): string | null {
  if (!code || code === ETC_REGION_CODE) return null;
  return code.slice(0, 2);
}

/** 저장해 둘 표시용 라벨 — 「서울 강남구」 / 「부산」 / 「그 외 지역」 */
export function regionLabelOf(code: string | null | undefined): string | null {
  if (!code) return null;
  const r = REGIONS.find((x) => x.code === code);
  if (!r) return null;
  if (r.code === ETC_REGION_CODE) return '그 외 지역';
  return r.name === '전체' ? r.sido : `${r.sido} ${r.name}`;
}
