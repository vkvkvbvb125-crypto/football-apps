// src/features/settings/utils/accountLabel.ts
//
// 프로필 카드의 이름 아래 줄에 무엇을 쓸지 정한다.
//
// 왜 필요한가. auth.users에는 email이 반드시 있어야 해서, 카카오·네이버 로그인은
// 실제로 메일이 오가지 않는 주소를 지어서 넣는다:
//
//   kakao-3812…@users.futsalclub.app
//   naver-027uiui_llhlcbffukzta1…@users.futsalclub.app
//
// kakao-login/naver-login 함수의 주석은 이 값을 두고 「실제로 메일이 오가는 주소가
// 아니라 사용자 눈에 띄지도 않는다」고 적어 두었다. 그 전제가 무너졌다 — 프로필
// 카드가 이름 아래에 이메일을 띄우면서 화면 맨 위에 그대로 나왔다.
// (앞서 「계정」 카드에도 있었지만 긴 화면의 맨 아래라 아무도 못 봤다.)
//
// ⚠ user_metadata.provider로 가르지 않는다. naver-login은 그 키를 넣는데
//   kakao-login은 안 넣는다 — 카카오 사용자에게는 판별할 값이 없다.
//   합성 주소의 도메인은 우리가 정한 것이라 둘 다 확실하다. 그쪽으로 가른다.
//
// ⚠ 도메인은 kakao-login/naver-login의 syntheticEmail과 같아야 한다.
//   거기 주석이 「브랜드가 바뀌어도 이 도메인은 그대로 둔다 — 바꾸면 기존 가입자를
//   못 찾는다」이니, 이 상수도 따라 바뀔 일이 없다.
const SYNTHETIC_DOMAIN = '@users.futsalclub.app';

const PROVIDER_LABEL: Record<string, string> = {
  kakao: '카카오 계정',
  naver: '네이버 계정',
};

/**
 * 로그인 수단을 사람이 읽을 수 있는 한 줄로 만든다.
 *
 * 이메일·구글·애플은 진짜 주소라 그대로 보여준다 — 어느 계정으로 들어왔는지
 * 그 자체가 정보다. 카카오·네이버는 주소가 가짜라 무엇으로 들어왔는지만 말한다.
 *
 * 못 알아보는 합성 주소는 빈 문자열을 돌려준다. 접두사를 모르는 것을 그대로
 * 띄우면 지금 고치는 문제가 그대로 남는다.
 */
export function accountLabel(email: string | null | undefined): string {
  if (!email) return '';
  if (!email.endsWith(SYNTHETIC_DOMAIN)) return email;

  const prefix = email.slice(0, email.length - SYNTHETIC_DOMAIN.length);
  const dash = prefix.indexOf('-');
  if (dash <= 0) return '';
  return PROVIDER_LABEL[prefix.slice(0, dash)] ?? '';
}
