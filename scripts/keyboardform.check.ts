/*
  입력 폼의 제출 버튼이 키보드에 가려지지 않는가.

  ── 기준 — 기기에서 재서 정했다 ───────────────────────────────────
  판정은 **버튼 하단 < 키보드 상단**. 조건은 **마지막 입력칸 포커스 · 스크롤 없음**.
  재는 수단은 `scripts/kbmeasure.sh`(창 관리자의 IME 인셋 + uiautomator bounds).

  **구조로 지킬 수 있는 것:**
    ⑴ ScrollView가 있고 `keyboardShouldPersistTaps`가 걸려 있다
    ⑵ KeyboardAvoidingView가 `behavior="padding"`이다 — 안드로이드에서 죽어 있지 않다
    ⑶ 제출 버튼이 **`</ScrollView>` 뒤, KAV 안**에 있다 — 다섯 폼 전부 같은 모양

  ── ⑶이 세 번 바뀐 자리다. 이력을 다 적는다 ──────────────────────
    ① 원래     `</ScrollView>` 뒤의 고정 footer.
               `behavior`가 `Platform.OS === 'ios' ? 'padding' : undefined`라
               **안드로이드에서 창이 안 줄었고**, footer가 키보드 아래로 들어갔다.
               스크롤해도 footer는 안 움직이니 닿을 방법이 없었다(2026-09-17).
    ② 88d3130  버튼을 ScrollView **안**으로 옮겼다. 검사는 통과했고 화면은 여전히 안 닿았다 —
               창이 안 줄어드니 스크롤할 것조차 없었다. **진단이 한 겹 얕았다.**
    ③ 3ccf014  `behavior="padding"`으로 창을 살렸다. 닿기는 하는데 **스크롤해야 보였다.**
    ④ 지금     다시 `</ScrollView>` 뒤로. 줄어든 창의 **마지막 형제 = 키보드 바로 위**다.

  ⚠ **①이 깨진 이유는 「밖에 있어서」가 아니라 아무도 키보드를 안 따라가서였다.**
    그걸 「밖에 두면 안 된다」로 읽은 것이 ②였다. 같은 자리를 두 번 헛짚었다.

  ── ④를 강제한 것은 글꼴 배율 200%다 ─────────────────────────────
  배율 1.0에서는 ③으로도 다섯 폼이 통과했다. 200% · 1080x1920에서 갈렸다:

      버튼이 KAV 안 형제  SignUp +121 · TeamStart +16    통과
      버튼이 ScrollView 안 Login 잘림(15px) · Forgot 잘림(9px)

  ⚠ **배율은 사용자가 접근성 설정으로 올린다 — 우리가 안 건드려도 일어난다.**
    옮긴 뒤 1.0의 넉넉하던 여유는 줄었지만(Login 486→152 · Forgot 228→144)
    다섯이 121~152px로 **고르게** 모였다. 가장 얇던 44px 자리가 없어진 것이 요점이다.

  ⚠ **LoginScreen만 보이는 순서가 바뀌었다.** 다른 폼은 버튼이 내용의 끝이라
    밖으로 빼도 순서가 그대로인데, 여기는 버튼 뒤에 링크·구분선·소셜 셋·안내문이 있었다.
    이제 소셜이 주 버튼보다 위에 온다 — **하단 고정 CTA로 받아들인 결정이다**(2026-09-19).

  ── 버린 길 둘 (기기에서 재고 버렸다) ─────────────────────────────
  ⓐ `KeyboardAwareScrollView` + 큰 `bottomOffset` — 큰 화면에서는 버튼이 올라오는데
     **작은 화면에서 포커스된 입력칸이 위로 잘려 나갔다.** 맞바꾸는 손잡이라 답이 아니다.
  ⓑ `KeyboardStickyView` — 버튼이 **포커스된 입력칸 위에 겹쳐 그려졌다**(스크린샷 확인).
  둘 다 `react-native-keyboard-controller`가 필요했다. **확정된 방법은 RN만으로 된다**(07e3c46).

  ⚠ 못 보는 것: 실제 픽셀은 **기기에서 재야** 안다(anchor.ts 「단언이 볼 수 없는 것」).
  ⚠ **주석을 걷어내고 본다.** 안 걷으면 위 설명의 `</ScrollView>`·`behavior=` 글자가
    코드로 잡힌다. 2026-09-17에 실제로 그랬다 — 코드가 아니라 **내가 쓴 주석**이 원인이었다.
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

  /* ⑴ 스크롤이 있고 첫 탭을 키보드가 먹지 않는다 */
  const open = src.indexOf('<ScrollView');
  assert.ok(open > 0, `${name}에 ScrollView가 없다 — 내용이 길어지면 닿을 방법이 없다`);
  const tag = src.slice(open, src.indexOf('>', open));
  assert.ok(
    /keyboardShouldPersistTaps/.test(tag),
    `${name}의 ScrollView에 keyboardShouldPersistTaps가 없다 — ` +
      `키보드가 떠 있으면 첫 탭이 키보드를 내리는 데만 쓰인다`
  );
  const close = src.indexOf('</ScrollView>', open);
  assert.ok(close > open, `${name}의 </ScrollView>를 못 찾았다`);

  /* ⑵ KAV가 안드로이드에서 살아 있는가 */
  const kavOpen = src.indexOf('<KeyboardAvoidingView');
  assert.ok(kavOpen > 0, `${name}에 KeyboardAvoidingView가 없다 — 창이 키보드 위로 안 줄어든다`);
  const kavClose = src.lastIndexOf('</KeyboardAvoidingView>');
  assert.ok(kavClose > kavOpen, `${name}의 </KeyboardAvoidingView>를 못 찾았다`);

  const kavTag = src.slice(kavOpen, src.indexOf('>', kavOpen));
  assert.ok(
    !/Platform\.OS/.test(kavTag),
    `${name}의 behavior가 플랫폼으로 갈린다 — 안드로이드에서 undefined면 ` +
      `KeyboardAvoidingView가 아무 일도 안 한다. 창이 안 줄어서 스크롤할 것조차 안 생긴다`
  );
  assert.ok(
    /behavior="padding"/.test(kavTag),
    `${name}의 KeyboardAvoidingView에 behavior="padding"이 없다 — 기기에서 이 값으로 재서 정했다`
  );

  /*
    ⑶ 제출 버튼이 **전부** `</ScrollView>` 뒤 · KAV 안에 있는가.

    ⚠ 하나만 보면 안 된다 — TeamStartScreen은 「참여하기」와 「만들기」 둘이 같은
      styles.cta를 쓴다. 첫 번째만 보면 두 번째가 안으로 들어가도 통과한다
      (anchor.ts 「하나와 전부」).
  */
  const ctas: number[] = [];
  for (let at = src.indexOf('styles.cta'); at !== -1; at = src.indexOf('styles.cta', at + 1)) ctas.push(at);
  assert.ok(
    ctas.length > 0,
    `${name}에서 제출 버튼(styles.cta)을 못 찾았다 — 이름이 바뀌었으면 이 검사도 고쳐라`
  );
  for (const at of ctas) {
    assert.ok(
      at > close,
      `${name}의 제출 버튼이 ScrollView 안에 있다(${at}) — 배율 200%에서 스크롤해야 보이거나 잘린다. ` +
        `</ScrollView> 뒤로 꺼내라`
    );
    assert.ok(
      at < kavClose,
      `${name}의 제출 버튼이 KeyboardAvoidingView 밖에 있다(${at}) — ` +
        `창이 줄어도 그 버튼은 안 따라와서 키보드 아래에 남는다`
    );
  }

  /*
    ⑷ 아래 여백이 **KAV 스타일이 아니라 버튼 바에 인라인**으로 있는가.

    ⚠ **KAV에 준 paddingBottom은 조용히 사라진다.** RN이 이렇게 렌더한다:

        style={StyleSheet.compose(style, {paddingBottom: bottomHeight})}
        (react-native/Libraries/Components/Keyboard/KeyboardAvoidingView.js:279)

      뒤가 이기므로 넘긴 style의 paddingBottom은 **키보드가 없을 때도** 0으로 덮인다.
      TeamStartScreen의 root에 `paddingBottom: 34`가 있었고 **한 번도 안 먹었다** —
      그래서 「참여하기」·「만들기」의 하단이 창 바닥보다 **16px 아래**에 있었다
      (2026-09-19 기기 실측, 2갈래 × 2화면크기 × 2배율 = 8회 전부 FAIL).

    ⚠ **오류도 경고도 없다.** 스타일은 그냥 무시된다. 그리고 이 결함은
      kbmeasure가 **글자 노드**를 재던 동안 보이지 않았다 — 글자는 버튼 안에
      가운데 정렬이라 잘림선 위에 있었다. 도구를 고치고 나서야 드러났다.
  */
  const kavStyle = /style=\{\[?\s*styles\.([A-Za-z0-9_]+)/.exec(kavTag)?.[1];
  assert.ok(kavStyle, `${name}의 KeyboardAvoidingView가 styles.*를 안 쓴다 — 이 검사도 고쳐라`);
  const styleBody = new RegExp('\n  ' + kavStyle + ': \{[^}]*\}').exec(src)?.[0] ?? '';
  assert.ok(
    styleBody.length > 0,
    `${name}에서 styles.${kavStyle}의 정의를 못 찾았다 — 한 줄 형태가 아니면 이 검사를 고쳐라`
  );
  assert.ok(
    !/paddingBottom/.test(styleBody),
    `${name}의 styles.${kavStyle}에 paddingBottom이 있다 — 이건 KeyboardAvoidingView가 ` +
      `덮어써서 **한 번도 안 먹는다**(compose의 뒤가 이긴다). 아래 여백은 버튼 바에 ` +
      `인라인으로 줘라: style={[styles.…, { paddingBottom: insets.bottom + 16 }]}`
  );

  /* ⑷-b 그 인라인 여백이 **버튼 쪽에** 실제로 있는가 (</ScrollView> 뒤) */
  const insetAt = src.indexOf('paddingBottom: insets.bottom', close);
  assert.ok(
    insetAt > close && insetAt < kavClose,
    `${name}의 제출 버튼 바에 paddingBottom: insets.bottom이 없다 — ` +
      `버튼이 창 바닥(=키보드 상단)에 딱 붙거나 그 아래로 넘어간다`
  );
}

console.log(
  `keyboardform ✓ 입력 폼 ${FORMS.length}개: behavior="padding" · 제출 버튼이 ScrollView 밖 · KAV 안`
);
