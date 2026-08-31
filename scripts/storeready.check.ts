// scripts/storeready.check.ts — 스토어 제출에 걸리는 것들의 불변식 검사
//
// 여기 있는 건 전부 "빠져도 앱은 멀쩡히 돌지만 심사에서 막히거나 첫인상이 깨지는" 것들이다.
// 화면을 열어봐도 안 보이니까 사람이 알아채는 시점이 제출 거절 메일이다 — 그래서 묶어 둔다.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const app = JSON.parse(read('app.json')).expo;

// ── 1. 약관을 가입 후에도 볼 수 있는가 ────────────────────────────────
// Apple/Google 둘 다 앱 안에서 약관·개인정보처리방침에 닿을 것을 본다.
// 가입 화면에만 있으면 이미 가입한 사람에게는 없는 것과 같다.
{
  /*
    ⚠ 예전엔 설정 화면 안에 목록이 펼쳐져 있었다. 문서가 다섯이라 화면을 반쯤
      먹어서 TermsScreen으로 뺐다. 옮기면 새 실패 갈래가 생긴다 —
      「화면은 있는데 거기로 갈 수 없다」. 그래서 둘을 같이 센다:
        ① 약관 화면에 목록과 모달이 있다
        ② 설정 화면에 그 화면으로 가는 줄이 있다
      하나만 세면 「줄은 있는데 안 열린다」거나 「화면은 있는데 못 간다」가 통과한다.
  */
  const s = read('src/features/settings/screens/TermsScreen.tsx');
  assert.ok(s.includes('TERMS.map'), '약관 화면에서 목록이 사라졌다 — 가입 화면 말고는 볼 곳이 없어진다');
  assert.ok(s.includes('<TermsDocModal'), '약관 화면에 모달이 없다 — 줄만 있고 눌러도 안 열린다');

  const settings = read('src/features/settings/screens/MySettingsScreen.tsx');
  assert.ok(/navigate\('Terms'\)/.test(settings),
    '설정 화면에 약관으로 가는 줄이 없다 — 화면은 있는데 갈 수 없다');

  // label은 가입 체크박스의 문장("…에 동의"), title은 문서 이름이다.
  // 설정에서 label을 쓰면 이미 동의한 사람에게 다시 동의하라는 말로 읽히고,
  // 모달 제목(title)과 줄 이름이 서로 달라진다.
  const row = s.match(/styles\.docRowText[^>]*>\{t\.(\w+)\}/);
  assert.ok(row, '약관 줄의 텍스트를 못 찾음');
  assert.equal(row![1], 'title', `약관 줄이 t.${row![1]}을 쓴다 — 모달 제목과 이름이 갈린다`);

  const modal = read('src/features/auth/components/TermsDocModal.tsx');
  assert.ok(/docTitle[^>]*>\{doc\?\.title\}/.test(modal), '모달 제목이 title이 아니다 — 위 검사와 짝이 안 맞는다');
}

// ── 2. 제출에 필요한 값이 있는가 ─────────────────────────────────────
// 빌드 번호 없이 올리면 스토어가 받지 않는다. 다음 제출 때 올리는 걸 잊는 쪽이 더 흔해서
// 존재만 확인한다(값이 몇인지는 여기서 못 판단한다).
{
  assert.ok(app.ios?.buildNumber, 'ios.buildNumber가 없다 — App Store가 받지 않는다');
  assert.ok(app.android?.versionCode, 'android.versionCode가 없다 — Play가 받지 않는다');

  /*
    앱에 라이트 테마가 없다. 그래서 다크로 고정하는데 — **설정만으로는 안 걸린다.**

    ⚠ 이 검사가 한 번 틀렸다. 예전엔 아래 한 줄뿐이었다:
        assert.equal(app.userInterfaceStyle, 'dark')
      그리고 그게 「다크 전용이 걸렸다」를 보증한다고 읽었다. **iOS에서만 맞았다.**

      iOS   withIosUserInterfaceStyle이 Info.plist에 UIUserInterfaceStyle을 쓴다.
            expo-system-ui 없이도 걸린다.
      안드로이드
            expo-system-ui가 없으면 @expo/prebuild-config의 스텁이
            WarningAggregator.addWarningAndroid로 경고만 내고 아무것도 안 쓴다.
            네이티브 테마는 Theme.AppCompat.DayNight 그대로라 시스템을 따른다.

      화면으로 확인한 것(2026-08-31, Pixel 7 / API 35): 시스템 테마가 라이트
      (`adb shell cmd uimode night` → no)인데 앱 화면은 다크로 뜨고, 텍스트 선택
      툴바·툴팁·커서 핸들만 밝게 떴다. 앱이 다크였던 건 설정 때문이 아니라
      색이 전부 박혀 있어서였다.

    **「플랫폼에 따라 같은 설정이 다르게 동작한다」가 이 검사가 놓친 축이다.**
    app.json 한 곳을 보고 두 플랫폼을 다 판정했다. 값이 있는 것과 그 값이
    동작하는 것은 다르고, 그 차이가 플랫폼마다 갈린다.

    그래서 둘을 같이 센다 — 설정값과, 그 값을 안드로이드에서 실제로 거는 패키지.
  */
  assert.equal(app.userInterfaceStyle, 'dark', '앱이 다크 전용인데 userInterfaceStyle이 다르다');

  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.dependencies?.['expo-system-ui'],
    'expo-system-ui가 없다 — 안드로이드에서 userInterfaceStyle이 무시되고 경고만 난다. ' +
    '키보드·다이얼로그·텍스트 선택 도구가 사용자 기기 설정을 따라 밝게 뜬다');

  /*
    설치만으로는 부족하다. 플러그인이 strings.xml에 값을 써야 네이티브가 읽는다.
      strings.xml  expo_system_ui_user_interface_style
      → SystemUIReactActivityLifecycleListener 가 읽어서
      → AppCompatDelegate.setDefaultNightMode()

    ⚠ android/ 는 prebuild 산출물이라 .gitignore에 있다. CI에는 없을 수 있으므로
      있을 때만 본다 — 없다고 실패시키면 「검사가 환경을 탄다」가 된다.
      대신 없을 때 조용히 넘어가지 않고, 무엇을 못 봤는지 남긴다.
  */
  const stringsPath = 'android/app/src/main/res/values/strings.xml';
  if (existsSync(new URL(`../${stringsPath}`, import.meta.url))) {
    const strings = read(stringsPath);
    const m = strings.match(/name="expo_system_ui_user_interface_style"[^>]*>([^<]+)</);
    assert.ok(m, `${stringsPath}에 expo_system_ui_user_interface_style이 없다 — prebuild를 다시 돌려야 한다`);
    assert.equal(m![1], app.userInterfaceStyle,
      `strings.xml(${m![1]})과 app.json(${app.userInterfaceStyle})이 갈렸다 — prebuild가 낡았다`);
  } else {
    console.log('  · android/ 없음 — strings.xml 확인은 건너뛴다 (prebuild 산출물)');
  }
}

// ── 3. 스플래시가 앱 배경과 같은 색인가 ──────────────────────────────
// 다른 색이면 켤 때 한 번 번쩍인다. app.json은 색을 문자열로 박을 수밖에 없어서
// 테마 토큰을 바꿔도 안 따라온다 — 갈라지는 걸 여기서 잡는다.
{
  const splash = (app.plugins ?? []).find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen');
  assert.ok(splash, 'expo-splash-screen 플러그인이 없다 — SDK 52+에서는 기본 흰 화면이 뜬다');
  const cfg = splash[1];
  const bg = read('src/theme.ts').match(/bgScreen:\s*'(#[0-9A-Fa-f]{6})'/)![1];
  assert.equal(cfg.backgroundColor.toUpperCase(), bg.toUpperCase(),
    `스플래시 배경(${cfg.backgroundColor})이 theme.bgScreen(${bg})과 다르다 — 켤 때 번쩍인다`);
  readFileSync(new URL(`../${cfg.image}`, import.meta.url)); // 없으면 여기서 던진다
}

console.log('storeready ok');
