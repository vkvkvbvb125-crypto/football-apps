// src/features/auth/screens/LoginScreen.tsx
// 로그인 / 회원가입 한 화면.
//
// 구성(기능)은 흔한 로그인 화면을 따른다 — 이메일·비밀번호, 비밀번호 찾기, 회원가입,
// 그리고 간편 로그인. 다만 생김새는 킥데이 것으로 다시 짰다: 다크 바탕에 초록 한 점,
// 1px 보더 카드, pill 배지 (design.md). 참고한 화면의 배치·색을 그대로 쓰지 않는다.
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../../components/nativeText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore, CREDENTIAL_MISMATCH, type SocialProvider } from '../stores/authStore';
import { radius, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';
import { GreenFill } from '../../../components/Surface';
import { GreenAmbient } from '../../../components/ScreenGradient';


/**
 * 간편 로그인 버튼들.
 *
 * 각 브랜드의 실제 마크를 쓴다 — 글자(K/G/N)로 대신하면 무슨 버튼인지 한눈에 안 들어온다.
 * 원 색도 브랜드 고정색이라 design.md의 "그린 단일 강조" 규칙에서 예외로 둔다
 * (카카오 노랑처럼 바꾸면 못 알아보는 색들이다).
 */
/*
  ── 애플 로그인이 왜 꺼져 있나 — 2026-09-09 ────────────────────────
  버튼은 남겨 두고 이 플래그로 가린다. **지우지 않는다** — iOS를 낼 때 되살린다.

  ⑴ **Supabase 프로젝트에서 provider가 꺼져 있다.** 재서 확인했다:
       GET {SUPABASE_URL}/auth/v1/settings → external.apple === false
     (google·kakao는 true다. 그래서 구글 버튼은 그대로 둔다.)
     꺼진 채로 누르면 「Unsupported provider」가 뜬다 — 앱 코드는 멀쩡한데
     버튼만 실패하는, 이 저장소가 계속 잡아온 「있는데 안 되는」 자리가 된다.

  ⑵ **켜려면 Apple 개발자 계정이 필요하다($99/년).** Service ID와 키를 그쪽에서
     만들어야 Supabase에 넣을 값이 나온다. 계정이 아직 없다.

  ⑶ **안드로이드만 내면 Apple의 요구가 해당 없다.** 「다른 소셜 로그인을 제공하면
     Apple 로그인도 넣어라」는 **App Store 심사 규칙**이다(HIG 4.8). Play에는 없다.
     즉 지금은 켤 이유가 규정 쪽에서도 오지 않는다.

  되살릴 때 할 일: Apple 개발자 계정 → Service ID·키 → Supabase에서 provider 켜기
  → 이 상수를 true로 → terms.ts의 소셜 제공사 목록에 「애플」 되돌리기.
  ⚠ terms.ts에서 뺀 이유는 그쪽 주석에 있다 — 안 쓰는 걸 적으면 그 문장이 거짓이다.

  검사(`socialprovider.check.ts`)가 「플래그가 꺼졌는데 버튼이 그려지는가」를 본다.
*/
const APPLE_LOGIN_ENABLED = false;

const SOCIALS: {
  key: SocialProvider;
  label: string;
  bg?: string;
  fg?: string;
  /**
   * 마크는 셋 중 하나로 온다:
   *  image — 공식 에셋(배경 포함). 원형으로 잘라 넣는다.
   *  icon  — 공식 에셋이 아직 없어 임시로 쓰는 아이콘
   *  text  — 네이버처럼 글자가 곧 마크인 경우
   */
  image?: number;
  icon?: keyof typeof Ionicons.glyphMap;
  text?: string;
}[] = [
  // 공식 에셋(assets/kakao.png)은 34px에 말풍선이 68%로 꽉 찬 크롭이라 이 자리에 안 맞는다 —
  // 키우면 답답하고 줄이면 나머지 마크보다 작아 보인다. @3x 여유 있는 버전이 오면 image로 바꾼다.
  /* 브랜드 고정색 — 테마와 무관하다. 팔레트에도 예외로 적혀 있다 */
  { key: 'kakao', label: '카카오', icon: 'chatbubble', bg: '#FEE500', fg: '#000000' },
  /*
    ⚠ 여기 흰색은 **브랜드 고정색이지 colors.text가 아니다.** 자동 치환이 한 번
      colors.text로 바꿨는데, 그러면 라이트에서 네이버 N과 애플 로고가 검게 변해
      초록·검정 바탕에 묻힌다. 마크의 색은 테마를 안 따른다.
  */
  { key: 'naver', label: '네이버', text: 'N', bg: '#03C75A', fg: '#FFFFFF' },
  // 공식 4색 G(360px, 흰 배경 + 여백 포함). 배경까지 들어 있어 원형 컨테이너가 잘라내면 된다.
  { key: 'google', label: '구글', image: require('../../../../assets/google.png'), bg: '#FFFFFF' },
  // 애플은 검은 배경 + 흰 로고가 공식 변형 중 하나다 (흰 배경 + 검은 로고보다 이쪽이 표준에 가깝다)
  ...(APPLE_LOGIN_ENABLED
    ? [{ key: 'apple' as const, label: '애플', icon: 'logo-apple' as const, bg: '#2B2B2B', fg: '#FFFFFF' }]
    : []),
];

/**
 * 아이콘이 붙은 입력칸.
 *
 * 예전엔 placeholder만 있는 맨 입력칸 둘이 나란히 있어서, 훑을 때 어느 칸이 무엇인지
 * 글자를 읽어야 알 수 있었다. 봉투·자물쇠는 글자보다 먼저 눈에 들어온다.
 * 이 화면에서 두 번 쓰이므로 여기 안에 둔다 — 다른 화면이 필요해지면 그때 밖으로 옮긴다.
 */
function AuthField({
  icon,
  right,
  ...input
}: React.ComponentProps<typeof TextInput> & {
  icon: keyof typeof Ionicons.glyphMap;
  right?: React.ReactNode;
}) {
  const { colors, styles } = useThemed(makeStyles);
  return (
    <View style={styles.field}>
      <Ionicons name={icon} size={18} color={colors.textMuted} />
      <TextInput
        style={styles.fieldInput}
        placeholderTextColor={colors.placeholder}
        {...input}
      />
      {right}
    </View>
  );
}

export function LoginScreen({ navigation }: { navigation: any }) {
  const { colors, styles } = useThemed(makeStyles);
  const signInWithSocial = useAuthStore((s) => s.signInWithSocial);
  const signInWithEmail = useAuthStore((s) => s.signInWithEmail);
  const clearError = useAuthStore((s) => s.clearError);
  const signingIn = useAuthStore((s) => s.signingIn);
  const error = useAuthStore((s) => s.error);
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  /** 비밀번호를 잘못 친 채로 계속 실패하는 걸 막는다 — 레퍼런스의 우측 eye 아이콘 */
  const [passwordShown, setPasswordShown] = useState(false);

  /** 비밀번호가 틀렸다 = 소셜로 가입했을 가능성 — 구분선 문구로 알려준다.
      다른 오류(만료된 링크 등)에는 붙이지 않는다. 답이 저 아래 있지 않다. */
  const showSocialHint = error === CREDENTIAL_MISMATCH;
  const canSubmit = email.trim().length > 0 && password.length > 0 && !signingIn;

  /** 다른 화면으로 갈 땐 이전 오류를 지운다 — 돌아왔을 때 남아 있으면 지금 것처럼 읽힌다 */
  const go = (screen: 'SignUp' | 'ForgotPassword') => {
    clearError();
    navigation.navigate(screen);
  };

  const submit = () => {
    if (!canSubmit) return;
    signInWithEmail(email, password);
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      {/* 앱 전체 공통 배경 — ScreenGradient를 안 쓰는 화면이라 조각만 가져다 쓴다 */}
      <GreenAmbient />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 앱 아이콘은 두지 않는다 — 방금 그 아이콘을 눌러서 들어온 화면이라 같은 그림을 두 번 보여주는 셈이고,
            글자만 남기면 워드마크가 화면의 주인공이 된다. */}
        <View style={styles.brandArea}>
          {/* 출시명이 KickDay라 라틴이 주 워드마크다. 초록은 앞 낱말에 — 홈 히어로와 같은 규칙.
              한글은 읽는 법을 알려주는 서브마크로 남긴다(국내 사용자는 "킥데이"라 부른다). */}
          <Text style={styles.brand}>
            <Text style={{ color: colors.green }}>Kick</Text>Day
          </Text>
          <Text style={styles.brandKo}>킥데이</Text>
          <Text style={styles.tagline}>우리 팀의 매주 그 시간</Text>
        </View>

        {/* 카드 없이 입력창을 배경에 바로 놓는다. 라벨도 두지 않고 placeholder만 쓴다 —
            대신 accessibilityLabel을 붙여 스크린리더에서는 항목 이름이 읽히게 한다
            (placeholder는 입력을 시작하면 사라져서 그것만으로는 접근성이 깨진다). */}
        <View style={styles.form}>
          <AuthField
            icon="mail-outline"
            value={email}
            onChangeText={setEmail}
            placeholder="이메일"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            accessibilityLabel="이메일"
          />

          <AuthField
            icon="lock-closed-outline"
            value={password}
            onChangeText={setPassword}
            placeholder="비밀번호"
            secureTextEntry={!passwordShown}
            autoCapitalize="none"
            onSubmitEditing={submit}
            returnKeyType="done"
            accessibilityLabel="비밀번호"
            right={
              <Pressable
                onPress={() => setPasswordShown((v) => !v)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={passwordShown ? '비밀번호 가리기' : '비밀번호 보기'}
              >
                {/*
                  아이콘은 "지금 어떤 상태인가"를 그린다 — 뜬 눈이면 보이는 중, 감은 눈이면 가린 중.
                  반대로(눌렀을 때 벌어질 일) 달아 뒀었는데, 눈 그림은 상태로 먼저 읽힌다.
                  누르면 무슨 일이 생기는지는 accessibilityLabel이 말한다.
                */}
                <Ionicons
                  name={passwordShown ? 'eye-outline' : 'eye-off-outline'}
                  size={18}
                  color={colors.textMuted}
                />
              </Pressable>
            }
          />

          {/* 오류는 버튼 바로 위에 — 눌렀는데 아무 반응 없어 보이면 안 된다 */}
          {!!error && <Text style={styles.errorText}>{error}</Text>}

          {/* 보조 경로는 버튼이 아니라 텍스트 링크로 — 로그인 CTA와 경쟁하면 안 된다 */}
          <View style={styles.linkRow}>
            <Pressable accessibilityRole="button" onPress={() => go('ForgotPassword')} hitSlop={8}>
              <Text style={styles.linkText}>비밀번호 찾기</Text>
            </Pressable>
            <View style={styles.linkDivider} />
            <Pressable accessibilityRole="button" onPress={() => go('SignUp')} hitSlop={8}>
              <Text style={styles.linkText}>회원가입</Text>
            </Pressable>
          </View>
        </View>

        {/* 로그인이 실패했을 때만 문구가 바뀐다 — 소셜로 가입한 사람은 여기서 답을 찾는다.
            오류 문구에 두 줄로 적으면 빨간 덩어리가 되어 무겁다. */}
        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={[styles.orText, showSocialHint && styles.orTextHint]}>
            {showSocialHint ? '간편 로그인으로 가입하셨나요?' : 'or'}
          </Text>
          <View style={styles.orLine} />
        </View>

        <View style={styles.socialRow}>
          {SOCIALS.map((s) => (
            <Pressable
              key={s.key}
              disabled={signingIn}
              onPress={() => signInWithSocial(s.key)}
              accessibilityRole="button"
              accessibilityLabel={`${s.label}로 로그인`}
              style={({ pressed }) => [styles.social, pressed && styles.pressed]}
            >
              <View style={[styles.socialCircle, !!s.bg && { backgroundColor: s.bg }]}>
                {s.image ? (
                  // 공식 에셋은 배경과 여백을 품고 있다 — 원형 컨테이너(overflow:hidden)가 원으로 잘라낸다
                  <Image source={s.image} style={styles.socialImage} resizeMode="cover" />
                ) : s.icon ? (
                  <Ionicons name={s.icon} size={24} color={s.fg} />
                ) : (
                  <Text style={[styles.socialMark, { color: s.fg }]}>{s.text}</Text>
                )}
              </View>
              <Text style={styles.socialLabel}>{s.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.footNote}>가입하면 팀을 만들거나 초대 코드로 참가할 수 있어요</Text>
      </ScrollView>

      {/*
        ⚠ **버튼은 ScrollView 밖, KAV 안이다.** 창이 키보드 위로 줄면 그 마지막 형제가
          키보드 바로 위에 선다(3ccf014에서 behavior="padding"으로 창이 실제로 줄게 됐다).

        ⚠ **글꼴 배율 200%가 이걸 요구했다.** 1.0에서는 ScrollView 안에서도 통과했지만
          (여유 44px), 200% · 1080x1920에서 버튼이 잘려 **위 15px만 보였다**(2026-09-19 실측).
          배율은 사용자가 접근성 설정으로 올리므로 우리가 안 건드려도 일어난다.

        ⚠ **이 화면만 순서가 바뀌었다.** 다른 폼은 버튼이 내용의 끝이라 밖으로 빼도
          보이는 순서가 그대로인데, 여기는 버튼 뒤에 링크·구분선·소셜 셋·안내문이 있었다.
          그래서 스크롤 내용의 **아래**에 버튼이 붙는다 — 키보드가 없을 때 소셜 로그인이
          주 버튼보다 위에 온다. 키보드가 떴을 때 버튼에 닿는 것을 우선했다.
      */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          accessibilityRole="button"
          disabled={!canSubmit}
          onPress={submit}
          style={({ pressed }) => [styles.cta, !canSubmit && styles.ctaOff, pressed && canSubmit && styles.pressed]}
        >
          <GreenFill />
          <Text style={styles.ctaText}>{signingIn ? '잠시만요…' : '로그인'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgRoot },
  // flexGrow + center — 화면이 크면 세로 가운데에 놓이고, 모자라거나 키보드가 올라오면 스크롤된다.
  // (콘텐츠가 600px쯤이라 큰 폰에서는 위로 쏠려 보였다)
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 20 },
  pressed: { opacity: 0.85 },

  // ── 브랜드 ────────────────────────────────────────────
  // 아이콘을 뺀 만큼 위쪽에 여백을 줘서 워드마크가 화면 상단에 붙지 않게 한다
  brandArea: { alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  brand: { color: colors.text, fontSize: 38, fontWeight: '800', letterSpacing: -1 },
  // 자간을 넓혀 주 워드마크와 굵기가 겹치지 않게 — 서브마크는 조용해야 한다
  brandKo: { color: colors.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 3, marginTop: 5 },
  tagline: { color: colors.textMuted, fontSize: 13, fontWeight: '600', marginTop: 10 },

  // ── 입력 폼 (카드 없이 배경 위에 바로) ────────────────
  form: { gap: 10 },
  /** 아이콘 + 입력 + (선택)우측 슬롯이 한 줄에 앉는 껍데기 */
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 56,
    paddingHorizontal: 16,
    borderRadius: radius.button,
    borderCurve: 'continuous',
    backgroundColor: colors.inputBg,
  },
  /*
   * 배경·반경은 껍데기(field)가 갖지만 높이는 입력칸도 같이 채워야 한다.
   *
   * flex: 1은 가로만 채운다. 세로는 비워 뒀더니 웹에서 <input>이 제 고유 높이(20px 남짓)로
   * 줄고 껍데기의 alignItems:'center'가 그걸 56px 한가운데에 놓았다 — 글자가 들어가는
   * 칸이 껍데기의 3분의 1이었고, 포커스 링이 짧게 떠서 그게 눈에 보였다.
   * 누를 수 있는 범위도 그 20px뿐이라 위아래 여백을 눌러도 커서가 안 잡혔다.
   *
   * paddingVertical: 0은 안드로이드용이다 — TextInput이 기본 세로 패딩을 얹어서
   * 늘린 높이 안에서 글자가 다시 내려앉는다.
   */
  fieldInput: {
    flex: 1,
    alignSelf: 'stretch',
    paddingVertical: 0,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },

  errorText: { color: colors.danger, fontSize: 12, fontWeight: '600' },

  cta: {
    overflow: 'hidden', // GreenFill을 모서리 안에 가둔다
    // 화면에서 가장 강한 요소 — 입력칸(56)보다 살짝 크게 잡아 마지막 단계임을 알린다
    height: 58,
    borderRadius: radius.button,
    borderCurve: 'continuous',
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  ctaOff: { opacity: 0.4 },
  ctaText: { color: colors.bgRoot, fontSize: 15, fontWeight: '800' },

  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, paddingTop: 10 },
  linkText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  linkDivider: { width: 1, height: 11, backgroundColor: colors.border },

  // ── 간편 로그인 ───────────────────────────────────────
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  orLine: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  orTextHint: { color: colors.green },

  socialRow: { flexDirection: 'row', justifyContent: 'center', gap: 22 },
  social: { alignItems: 'center', gap: 7 },
  // 52px — 탭 타겟 최소 크기(44px)를 넉넉히 넘긴다. 브랜드 원이라 테두리는 두지 않는다.
  // overflow:hidden — 배경까지 포함된 공식 마크(사각형)를 원으로 잘라내는 역할
  socialCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  socialImage: { width: '100%', height: '100%' },
  socialMark: { fontSize: 22, fontWeight: '800' },
  socialLabel: { color: colors.textBody, fontSize: 11, fontWeight: '700' },

  /* 버튼이 ScrollView 밖으로 나가면서 생긴 바. 스크롤 내용과 붙지 않게 위를 띄운다 */
  footer: { paddingHorizontal: 24, paddingTop: 12 },
  footNote: { color: colors.textFaint, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  });
