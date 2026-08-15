// src/features/auth/screens/LoginScreen.tsx
// 로그인 / 회원가입 한 화면.
//
// 구성(기능)은 흔한 로그인 화면을 따른다 — 이메일·비밀번호, 비밀번호 찾기, 회원가입,
// 그리고 간편 로그인. 다만 생김새는 킥데이 것으로 다시 짰다: 다크 바탕에 초록 한 점,
// 1px 보더 카드, pill 배지 (design.md). 참고한 화면의 배치·색을 그대로 쓰지 않는다.
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../../components/nativeText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore, CREDENTIAL_MISMATCH, type SocialProvider } from '../stores/authStore';
import { colors, radius } from '../../../theme';


/**
 * 간편 로그인 버튼들.
 *
 * 각 브랜드의 실제 마크를 쓴다 — 글자(K/G/N)로 대신하면 무슨 버튼인지 한눈에 안 들어온다.
 * 원 색도 브랜드 고정색이라 design.md의 "그린 단일 강조" 규칙에서 예외로 둔다
 * (카카오 노랑처럼 바꾸면 못 알아보는 색들이다).
 */
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
  { key: 'kakao', label: '카카오', icon: 'chatbubble', bg: colors.kakao, fg: colors.kakaoText },
  { key: 'naver', label: '네이버', text: 'N', bg: '#03C75A', fg: '#FFFFFF' },
  // 공식 4색 G(360px, 흰 배경 + 여백 포함). 배경까지 들어 있어 원형 컨테이너가 잘라내면 된다.
  { key: 'google', label: '구글', image: require('../../../../assets/google.png'), bg: '#FFFFFF' },
  // 애플은 검은 배경 + 흰 로고가 공식 변형 중 하나다 (흰 배경 + 검은 로고보다 이쪽이 표준에 가깝다)
  { key: 'apple', label: '애플', icon: 'logo-apple', bg: '#2B2B2B', fg: '#FFFFFF' },
];

export function LoginScreen({ navigation }: { navigation: any }) {
  const signInWithSocial = useAuthStore((s) => s.signInWithSocial);
  const signInWithEmail = useAuthStore((s) => s.signInWithEmail);
  const clearError = useAuthStore((s) => s.clearError);
  const signingIn = useAuthStore((s) => s.signingIn);
  const error = useAuthStore((s) => s.error);
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="이메일"
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            accessibilityLabel="이메일"
          />

          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="비밀번호"
            placeholderTextColor={colors.placeholder}
            secureTextEntry
            autoCapitalize="none"
            onSubmitEditing={submit}
            returnKeyType="done"
            accessibilityLabel="비밀번호"
          />

          {/* 오류는 버튼 바로 위에 — 눌렀는데 아무 반응 없어 보이면 안 된다 */}
          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <Pressable
            disabled={!canSubmit}
            onPress={submit}
            style={({ pressed }) => [styles.cta, !canSubmit && styles.ctaOff, pressed && canSubmit && styles.pressed]}
          >
            <Text style={styles.ctaText}>{signingIn ? '잠시만요…' : '로그인'}</Text>
          </Pressable>

          {/* 보조 경로는 버튼이 아니라 텍스트 링크로 — 로그인 CTA와 경쟁하면 안 된다 */}
          <View style={styles.linkRow}>
            <Pressable onPress={() => go('ForgotPassword')} hitSlop={8}>
              <Text style={styles.linkText}>비밀번호 찾기</Text>
            </Pressable>
            <View style={styles.linkDivider} />
            <Pressable onPress={() => go('SignUp')} hitSlop={8}>
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
  input: {
    height: 52,
    paddingHorizontal: 16,
    borderRadius: radius.button,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 14.5,
    fontWeight: '600',
  },

  errorText: { color: colors.danger, fontSize: 12.5, fontWeight: '600' },

  cta: {
    height: 52,
    borderRadius: radius.button,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  ctaOff: { opacity: 0.4 },
  ctaText: { color: colors.bgRoot, fontSize: 15, fontWeight: '800' },

  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, paddingTop: 10 },
  linkText: { color: colors.textMuted, fontSize: 12.5, fontWeight: '700' },
  linkDivider: { width: 1, height: 11, backgroundColor: colors.border },

  // ── 간편 로그인 ───────────────────────────────────────
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  orLine: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { color: colors.textDim, fontSize: 11.5, fontWeight: '700' },
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

  footNote: { color: colors.textFaint, fontSize: 11.5, fontWeight: '600', textAlign: 'center' },
});
