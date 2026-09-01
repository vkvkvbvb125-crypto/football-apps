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

/**
 * 화면에 그대로 보여도 되는 오류.
 *
 * 왜 타입으로 표시하나. 이 catch들에는 **두 종류가 섞여 들어온다** —
 * 서비스가 사람 말로 던진 것(「마지막 총무는 팀을 나갈 수 없어요」)과
 * Postgres·Storage·Functions의 원문이다. 전부 덮으면 사용자가 **할 수 있는
 * 일을 못 알려주고**(영원히 안 되는 일을 「잠시 후 다시」로 안내한다),
 * 전부 그대로 두면 제약 이름과 테이블 이름이 샌다.
 *
 * 가르는 방법을 셋 재봤다:
 *   (가) 한글이 들어 있으면 사람 말   → Postgres가 한글 데이터를 담아 던지면 샌다
 *   (나) code가 없으면 사람 말        → 네트워크 오류도 code가 없다
 *   (다) 전용 클래스                  ← 이것
 *
 * (가)(나)는 **추측**이다. 이 저장소에서 추측으로 가른 것이 여러 번 틀렸다.
 * 타입으로 표시하면 나중에 사람 말을 추가하는 사람이 **자동으로 맞는다** —
 * 그냥 Error로 던지면 덮이고, 덮이는 게 기본값인 편이 안전하다.
 *
 * ⚠ 여기 담는 문장의 기준은 계정 삭제다(accountService·describeBlockers):
 *   **막힌 이유를 말하고, 할 수 있는 일이 있으면 그것까지 말한다.**
 *   「저장 실패」처럼 이유도 행동도 없는 문장은 GENERIC과 다를 바 없으니
 *   이 클래스로 던질 이유가 없다.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

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
  /*
    사람 말은 그대로 통과시킨다 — **맨 앞이어야 한다.**
    아래 switch는 code로 가르는데 이건 code가 없어서 default(GENERIC)로 떨어진다.
    그러면 「마지막 총무는 팀을 나갈 수 없어요」가 「잠시 후 다시 시도해주세요」가 되고,
    사용자는 영원히 안 되는 일을 다시 시도하게 된다.
    ⚠ 콘솔에도 안 남긴다. 이건 오류가 아니라 **의도한 안내**다 —
      남기면 진짜 오류를 찾을 때 소음이 된다.
  */
  if (err instanceof UserFacingError) return err.message;

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
