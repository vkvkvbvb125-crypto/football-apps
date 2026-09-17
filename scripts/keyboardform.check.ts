/*
  입력 폼의 제출 버튼이 키보드에 가려지지 않는가.

  ── 기준 — 2026-09-17에 기기에서 재서 정했다 ──────────────────────
  판정은 **버튼 하단 < 키보드 상단**이다. 조건은 **마지막 입력칸에 포커스한 채
  스크롤하지 않은 상태**. 재는 수단은 `scripts/kbmeasure.sh`다(창 관리자의 IME 인셋 +
  uiautomator의 bounds).

  **구조로 지킬 수 있는 것은 하나뿐이다: 제출 버튼이 KeyboardAvoidingView 안에 있고,
  그 KAV의 behavior가 안드로이드에서 살아 있는 것.**

  ⚠ **「버튼이 ScrollView 안에 있는가」는 기준이 아니었다.** 이 검사가 그렇게 보다가
    두 번 헛짚었다:

      ① 88d3130   버튼을 ScrollView 안으로 옮기고 「고쳤다」고 했다. 검사는 통과했다.
                  **화면에서는 안 닿았다** — behavior가 ios 분기라 KAV가 아무 일도
                  안 했고, 창이 안 줄어드니 스크롤할 것조차 없었다.
      ② 3ccf014   behavior="padding"으로 살렸다. 닿기는 하는데 **스크롤해야 보였다**.
                  작은 화면(1080x1920)에서는 두 번 스크롤해야 했다.

    갈린 것은 **KAV 안이냐**였다. 창이 키보드 위로 줄면 그 안의 마지막 형제는
    키보드 바로 위에 선다 — ScrollView 안이든 밖이든.

  ── 확정된 모양 ───────────────────────────────────────────────────
      <KeyboardAvoidingView behavior="padding">     ← 창을 키보드 위로 줄인다
        <header/>
        <ScrollView keyboardShouldPersistTaps="handled"> … </ScrollView>
        <footer><제출 버튼/></footer>                ← 줄어든 창의 바닥 = 키보드 바로 위
      </KeyboardAvoidingView>

  ⚠ 버튼을 ScrollView **안**에 둬도 된다 — Login·Forgot·ResetPassword가 그 모양이고
    내용이 짧아 통과한다. **긴 폼(SignUp)만 밖으로 꺼냈다.** 안에 두면 스크롤해야
    보이기 때문이다. 둘 다 KAV 안이라는 점이 같다.

  ── 버린 길 둘 (기기에서 재고 버렸다) ─────────────────────────────
  ⓐ `KeyboardAwareScrollView` + 큰 `bottomOffset` — 큰 화면에서는 버튼이 올라오는데
     **작은 화면에서 포커스된 입력칸이 위로 잘려 나갔다.** 버튼과 입력칸을 맞바꾸는
     손잡이라 답이 아니다.
  ⓑ `KeyboardStickyView`로 버튼을 띄우기 — 버튼이 **포커스된 입력칸 위에 겹쳐
     그려졌다.** 스크롤 영역은 키보드 상단까지인데 버튼이 그 위에 떠서다.
  둘 다 `react-native-keyboard-controller`가 필요했다. **확정된 방법은 RN만으로 된다.**

  ── 이 검사가 보는 것 ─────────────────────────────────────────────
  ⑴ ScrollView가 있고 `keyboardShouldPersistTaps`가 걸려 있다
     (⚠ 없으면 키보드가 떠 있을 때 **첫 탭이 키보드를 내리는 데만 쓰인다**)
  ⑵ KeyboardAvoidingView가 있고 `behavior="padding"`이다 — 안드로이드에서 죽어 있지 않다
  ⑶ 제출 버튼(styles.cta)이 **전부** 그 KAV 안에 있다

  ⚠ 못 보는 것: 실제 픽셀은 **기기에서 재야** 안다(anchor.ts 「단언이 볼 수 없는 것」).
    이 검사는 「구조가 그럴 수 있는 모양인가」까지다.

  ⚠ **주석을 걷어내고 본다.** 안 걷으면 위 설명 안의 `</ScrollView>`·`behavior=` 글자가
    코드로 잡힌다. 2026-09-17에 실제로 그랬다 — 근거 주석을 달자마자 검사가 실패했고,
    코드가 아니라 **내가 쓴 주석**이 원인이었다(anchor.ts 「사본을 셀 때」).
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
    `${name}의 KeyboardAvoidingView에 behavior="padding"이 없다 — ` +
      `기기에서 이 값으로 재서 정했다(2026-09-17)`
  );

  /*
    ⑶ 제출 버튼이 **전부** KAV 안에 있는가.

    ⚠ 하나만 보면 안 된다 — TeamStartScreen은 「참여하기」와 「만들기」 둘이 같은
      styles.cta를 쓴다. 첫 번째만 보면 두 번째가 밖으로 나가도 통과한다
      (anchor.ts 「하나와 전부」).
    ⚠ ScrollView 안이냐 밖이냐는 **안 본다.** 그게 기준이 아니라는 것이
      이 검사가 두 번 헛짚고 알아낸 것이다. 위 머리말 참고.
  */
  const ctas: number[] = [];
  for (let at = src.indexOf('styles.cta'); at !== -1; at = src.indexOf('styles.cta', at + 1)) ctas.push(at);
  assert.ok(
    ctas.length > 0,
    `${name}에서 제출 버튼(styles.cta)을 못 찾았다 — 이름이 바뀌었으면 이 검사도 고쳐라`
  );
  for (const at of ctas) {
    assert.ok(
      at > kavOpen && at < kavClose,
      `${name}의 제출 버튼이 KeyboardAvoidingView 밖에 있다(${at}) — ` +
        `창이 줄어도 그 버튼은 안 따라와서 키보드 아래에 남는다`
    );
  }
}

console.log(
  `keyboardform ✓ 입력 폼 ${FORMS.length}개: 스크롤 · behavior="padding" · 제출 버튼이 KAV 안`
);
