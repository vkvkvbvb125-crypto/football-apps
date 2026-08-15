// src/features/auth/email.ts
// 이메일 형식 검사와 흔한 오타 교정 제안.
//
// 로그인·가입·비밀번호 찾기가 같은 규칙을 써야 한다. 한 곳만 느슨하면 그 경로로 들어온
// 오타가 계정에 그대로 박혀서, 나중에 비밀번호를 잃었을 때 복구할 방법이 없어진다.

/**
 * 형식 검사.
 *
 * RFC를 그대로 구현하지 않는다 — 실제로 걸러야 하는 건 "@를 빼먹었다", "점이 없다"
 * 같은 오타지, 희귀한 합법 주소를 막는 게 아니다. 지나치게 엄격하면 멀쩡한 주소를
 * 거부해서 가입을 막는 쪽이 더 큰 손해다.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string) {
  return EMAIL_RE.test(value.trim());
}

/**
 * 형식이 틀렸을 때 보여줄 문구. 여러 화면이 같은 말을 해야 해서 여기 둔다.
 *
 * 예시에 특정 서비스(naver, gmail 등)를 쓰지 않는다 — 그 서비스 계정이어야 하는 것처럼
 * 읽힌다. example.com은 이런 용도로 예약된 도메인이라 실제로 존재하지도 않는다.
 */
export const EMAIL_FORMAT_HINT = '이메일 주소를 정확히 입력해주세요 (예: kickday@example.com)';

/** 국내에서 대부분을 차지하는 도메인들 — 오타 교정의 기준이 된다 */
const COMMON_DOMAINS = [
  'naver.com',
  'gmail.com',
  'daum.net',
  'hanmail.net',
  'nate.com',
  'kakao.com',
  'icloud.com',
  'outlook.com',
  'hotmail.com',
  'yahoo.com',
];

/**
 * 편집 거리 — 자리바꿈(transposition)도 1로 센다.
 *
 * 평범한 레벤슈타인은 "gmial → gmail"을 2로 세서 놓친다. 그런데 두 글자가 뒤바뀌는 건
 * 손가락이 먼저 나가서 생기는 가장 흔한 오타라, 이걸 못 잡으면 쓸모가 절반이다.
 */
function editDistance(a: string, b: string) {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);

      // 앞뒤 두 글자가 서로 뒤바뀐 경우
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[a.length][b.length];
}

/**
 * "naver.con"처럼 한 글자 틀린 도메인을 고쳐서 돌려준다. 짚을 게 없으면 null.
 *
 * 형식은 멀쩡해서 검사를 통과하지만 메일은 영영 도착하지 않는 종류의 오타다 —
 * 그냥 두면 "보냈어요"만 보고 계속 기다리게 된다.
 */
export function suggestEmailFix(value: string): string | null {
  const email = value.trim();
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return null;

  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (COMMON_DOMAINS.includes(domain)) return null;

  const near = COMMON_DOMAINS.find((d) => editDistance(domain, d) === 1);
  return near ? `${local}@${near}` : null;
}
