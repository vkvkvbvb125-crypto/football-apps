/*
  입력 폼의 제출 버튼이 키보드에 가려지지 않는가.

  ── 왜 이 검사가 있나 ──────────────────────────────────────────────
  안드로이드는 `windowSoftInputMode=adjustResize`로 **창을 줄인다.** 그런데
  `</ScrollView>` **뒤에 고정된 footer는 줄어든 창의 바닥에 그대로 붙어**
  키보드 아래로 들어간다. 스크롤해도 footer는 안 움직이니 **닿을 방법이 없다.**

  ⚠ `KeyboardAvoidingView`가 있어도 안 막힌다. 이 저장소는 `behavior`를
    `Platform.OS === 'ios' ? 'padding' : undefined`로 주므로 **안드로이드에서는
    아무 일도 안 한다.** 「KeyboardAvoidingView가 있으니 괜찮겠지」가 함정이다.

  2026-09-17에 기기에서 확인했다:
      SignUpScreen         「가입하기」가 화면 밖 — 키보드를 내려야만 눌린다
      TeamStartScreen      ScrollView가 아예 없어서 스크롤조차 안 됐다
      ForgotPasswordScreen 같은 구조
      LoginScreen          버튼이 ScrollView 안 → 키보드 위에 남는다 (정상)

  ⚠ **TeamStartScreen은 가입 직후 반드시 지나는 화면**이다. 첫인상에서 막히고,
    사용자는 「만들기가 안 눌린다」로 읽는다.

  ── 이 검사가 보는 것 ─────────────────────────────────────────────
  입력 폼 화면마다 ⑴ ScrollView가 있고 ⑵ 제출 버튼(styles.cta)이 그 **안**에 있고
  ⑶ `keyboardShouldPersistTaps`가 걸려 있는가.

  ⚠ ⑶이 없으면 키보드가 떠 있을 때 **첫 탭이 키보드를 내리는 데만 쓰이고**
    버튼에 안 닿는다 — 「한 번 눌렀는데 아무 일도 안 난다」가 된다.

  ⚠ 못 보는 것: 버튼이 실제로 키보드 위에 오는지는 **화면을 봐야** 안다.
    이 검사는 「구조가 그럴 수 있는 모양인가」까지다(anchor.ts 「단언이 볼 수 없는 것」).
*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
  ⚠ **주석을 걷어내고 본다.** 안 걷으면 이 검사가 지키려는 구조를 설명하는 주석의
    `</ScrollView>` 글자가 **닫는 태그로 잡혀** 버튼이 밖에 있다고 오판한다.
    2026-09-17에 실제로 그랬다 — 고친 코드에 근거 주석을 달자마자 검사가 실패했고,
    코드가 아니라 **내가 쓴 주석**이 원인이었다.
    (anchor.ts 「사본을 셀 때」 — 근거를 적으면 그 이름이 주석에 남는다. 같은 날
     적어 둔 축을 같은 날 다시 밟았다.)
*/
const read = (p: string) =>
  readFileSync(p, 'utf8')
    .split('\r')
    .join('')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '') // JSX 주석 {/* … */}
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(String.fromCharCode(10))
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join(String.fromCharCode(10));

/* 텍스트 입력을 받고 제출 버튼이 있는 화면들. 새 폼을 만들면 여기 추가해라 */
const FORMS = [
  'src/features/auth/screens/SignUpScreen.tsx',
  'src/features/auth/screens/LoginScreen.tsx',
  'src/features/auth/screens/ForgotPasswordScreen.tsx',
  'src/features/auth/screens/ResetPasswordScreen.tsx',
  'src/features/team/screens/TeamStartScreen.tsx',
];

for (const f of FORMS) {
  const src = read(f);
  const name = f.split('/').pop();

  /* ⑴ 스크롤이 있는가 */
  const open = src.indexOf('<ScrollView');
  assert.ok(open > 0, `${name}에 ScrollView가 없다 — 키보드가 덮으면 스크롤로도 못 닿는다`);

  const close = src.indexOf('</ScrollView>', open);
  assert.ok(close > open, `${name}의 </ScrollView>를 못 찾았다`);

  /* ⑶ 첫 탭을 키보드가 먹지 않게 */
  const tag = src.slice(open, src.indexOf('>', open));
  assert.ok(
    /keyboardShouldPersistTaps/.test(tag),
    `${name}의 ScrollView에 keyboardShouldPersistTaps가 없다 — ` +
      `키보드가 떠 있으면 첫 탭이 키보드를 내리는 데만 쓰인다`
  );

  /*
    ⑵ 제출 버튼이 스크롤 **안**에 있는가.

    ⚠ 위치로 본다 — 「styles.cta가 파일에 있는가」로 보면 밖에 있어도 통과한다.
      이 검사가 막으려는 것이 정확히 「밖에 있는 것」이라 자리를 봐야 한다.
  */
  const cta = src.indexOf('styles.cta');
  assert.ok(cta > 0, `${name}에서 제출 버튼(styles.cta)을 못 찾았다 — 이름이 바뀌었으면 이 검사도 고쳐라`);
  assert.ok(
    cta > open && cta < close,
    `${name}의 제출 버튼이 ScrollView 밖에 있다 — ` +
      `adjustResize는 창만 줄이고 고정 footer는 키보드 아래에 남는다. 스크롤해도 안 움직인다`
  );
}

console.log(`keyboardform ✓ 입력 폼 ${FORMS.length}개의 제출 버튼이 스크롤 안에 있다`);
