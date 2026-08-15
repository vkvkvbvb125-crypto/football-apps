// src/features/auth/password.ts
// 비밀번호 규칙 — 회원가입과 재설정이 같은 기준을 써야 한다.
//
// 한쪽만 느슨하면, 가입은 됐는데 재설정에서 거부당하는(또는 그 반대의) 상황이 생긴다.
//
// 규칙은 Supabase 서버 설정보다 **엄격하게** 잡는다. 앱이 더 느슨하면 초록 체크를
// 다 켜놓고 서버에서 거절당하는 꼴이 된다. 더 엄격한 건 그런 사고가 없다.

export interface PasswordCheck {
  /** 화면에 그대로 나가는 문구 */
  label: string;
  /** 예시가 필요한 항목만 (특수문자처럼 뭘 말하는지 모를 수 있는 것) */
  example?: string;
  ok: boolean;
}

export const MIN_PASSWORD = 8;

/**
 * 조건별 충족 여부. 화면은 이 배열을 그대로 그린다.
 *
 * "무엇이 부족한지"를 전부 보여준다 — 하나씩 알려주면 고칠 때마다 새 문제가 튀어나와
 * 몇 번이나 다시 입력하게 된다.
 */
export function passwordChecks(value: string): PasswordCheck[] {
  return [
    { label: `${MIN_PASSWORD}자 이상`, ok: value.length >= MIN_PASSWORD },
    { label: '숫자 1개 이상', ok: /[0-9]/.test(value) },
    { label: '특수문자 1개 이상', example: '$, !, @, %, &', ok: /[^A-Za-z0-9]/.test(value) },
    // 앞뒤 공백은 눈에 안 보인다. 복사해 붙일 때 딸려 들어와서 "분명히 맞게 쳤는데
    // 로그인이 안 되는" 원인이 된다.
    { label: '앞뒤 공백 없음', ok: value.length > 0 && value === value.trim() },
  ];
}

export function isValidPassword(value: string) {
  return passwordChecks(value).every((c) => c.ok);
}
