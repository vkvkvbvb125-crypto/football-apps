// src/lib/dbError.ts
// DB 오류를 사람이 읽을 문장으로.
//
// 스토어들이 catch에서 err.message를 그대로 화면에 세우고 있었다. 그러면 총무에게
//   duplicate key value violates unique constraint "matches_team_date_uniq"
// 같은 문장이 그대로 뜬다. 읽을 수 없을 뿐 아니라 테이블·제약 이름이 노출된다.
//
// unique 위반만 번역하고 끝내지 않는다 — FK 위반, not-null 위반, 네트워크 끊김도
// 같은 경로로 나온다. 아는 것만 번역하고 나머지는 일반 문구로 감싼다.
// 원문은 버리지 않고 콘솔에 남긴다: 사용자에게 안 보일 뿐 디버깅에는 필요하다.

/** PostgREST가 실어 보내는 에러 모양 */
interface PgError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

const GENERIC = '문제가 생겼어요. 잠시 후 다시 시도해주세요';

/**
 * @param err   catch로 받은 값
 * @param known 이 화면에서만 뜻이 있는 코드 → 문구. 예: { '23505': '이미 같은 시각에 경기가 있어요' }
 * @param where 콘솔에 남길 위치 표시
 */
export function toUserMessage(err: unknown, known: Record<string, string> = {}, where = 'db'): string {
  const e = (err ?? {}) as PgError;
  // 원문은 콘솔에만 — 화면에는 절대 내보내지 않는다
  console.error(`[${where}]`, e.code ?? '', e.message ?? err, e.details ?? '');

  if (e.code && known[e.code]) return known[e.code];

  // 코드별 기본 번역 — 화면마다 다시 쓰지 않게 여기 모은다
  switch (e.code) {
    case '23505':
      return '이미 같은 내용이 있어요';
    case '23503':
      return '연결된 정보가 없어졌어요. 새로고침 후 다시 시도해주세요';
    case '23502':
      return '빠진 항목이 있어요';
    case '42501':
      return '권한이 없어요. 총무에게 문의해주세요';
    case 'PGRST301':
      return '로그인이 만료됐어요. 다시 로그인해주세요';
    default:
      // 네트워크는 code가 없고 message만 온다
      if (typeof e.message === 'string' && /fetch|network|Failed to fetch/i.test(e.message)) {
        return '연결이 끊겼어요. 네트워크를 확인해주세요';
      }
      return GENERIC;
  }
}
