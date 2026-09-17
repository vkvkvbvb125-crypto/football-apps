// src/features/auth/screens/ForgotPasswordScreen.tsx
// 비밀번호 찾기 — 가입한 이메일로 재설정 메일을 보낸다.
//
// 참고한 화면은 "아이디 입력 → 본인인증 → 새 비밀번호"인데, 우리는 아이디가 곧 이메일이라
// 본인인증 단계가 필요 없다. 메일함이 곧 본인 확인이다.
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from '../../../components/nativeText';
import { useAuthStore } from '../stores/authStore';
import { isValidEmail, suggestEmailFix, EMAIL_FORMAT_HINT } from '../email';
import { radius, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';
import { GreenAmbient } from '../../../components/ScreenGradient';

export function ForgotPasswordScreen({ navigation }: { navigation: any }) {
  const { colors, styles } = useThemed(makeStyles);
  const sendPasswordReset = useAuthStore((s) => s.sendPasswordReset);
  const signingIn = useAuthStore((s) => s.signingIn);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [formatError, setFormatError] = useState<string | null>(null);

  // 오타 제안은 입력 중에는 방해되니, 형식이 갖춰진 뒤에만 띄운다
  const suggestion = isValidEmail(email) ? suggestEmailFix(email) : null;
  const canSubmit = email.trim().length > 0 && !signingIn;

  const submit = async () => {
    if (!canSubmit) return;
    if (!isValidEmail(email)) {
      setFormatError(EMAIL_FORMAT_HINT);
      setSent(false);
      return;
    }
    setFormatError(null);
    clearError();
    await sendPasswordReset(email);
    setSent(true);
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* 앱 전체 공통 배경 — ScreenGradient를 안 쓰는 화면이라 조각만 가져다 쓴다 */}
      <GreenAmbient />
      <View style={[styles.head, { paddingTop: insets.top + 8 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="뒤로"
        >
          <Ionicons name="chevron-back" size={22} color={colors.textStrong} />
        </Pressable>
        <Text style={styles.headTitle}>비밀번호 찾기</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.desc}>
          가입한 이메일 주소를 입력해 주세요.{'\n'}비밀번호를 새로 정할 수 있는 링크를 보내드려요.
        </Text>

        <TextInput
          style={styles.input}
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            if (sent) setSent(false);
            if (formatError) setFormatError(null);
          }}
          placeholder="이메일"
          placeholderTextColor={colors.placeholder}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          accessibilityLabel="이메일"
          onSubmitEditing={submit}
          returnKeyType="done"
        />

        {!!formatError && <Text style={styles.errorText}>{formatError}</Text>}

        {/* "형식은 맞지만 도착하지 않을" 주소 — 눌러서 바로 고칠 수 있게 한다 */}
        {!formatError && !!suggestion && (
          <Pressable accessibilityRole="button" onPress={() => setEmail(suggestion)} style={styles.suggestRow}>
            <Text style={styles.suggestText}>
              혹시 <Text style={styles.suggestStrong}>{suggestion}</Text> 아닌가요? 눌러서 바꾸기
            </Text>
          </Pressable>
        )}

        {!formatError && !!error && <Text style={styles.errorText}>{error}</Text>}
        {!formatError && !error && sent && (
          <Text style={styles.noticeText}>
            {email.trim()}(으)로 메일을 보냈어요.{'\n'}
            5분 안에 오지 않으면 스팸함을 확인하시고, 그래도 없으면 가입할 때 쓴 주소가 맞는지
            확인해주세요.
          </Text>
        )}

        {/* 소셜로 가입했으면 비밀번호 자체가 없다 — 여기서 헤매지 않도록 알려준다 */}
        <Pressable accessibilityRole="button" onPress={() => navigation.goBack()} hitSlop={8} style={styles.linkRow}>
          <Text style={styles.linkText}>간편 로그인으로 가입하셨나요? 로그인으로 돌아가기</Text>
        </Pressable>
      {/*
        ⚠ **버튼이 ScrollView 안에 있어야 한다. 밖에 고정하면 키보드가 덮는다.**

        전에는 </ScrollView> 뒤의 고정 footer였다. 안드로이드는 창을 adjustResize로
        줄이지만 **고정 footer는 줄어든 창의 바닥에 그대로 붙어 키보드 아래로 들어간다** —
        스크롤해도 footer는 안 움직이니 **닿을 방법이 없다.**
        2026-09-17에 기기에서 확인했다(회원가입 화면에서 「가입하기」가 화면 밖).

        안으로 넣으면 스크롤이 버튼까지 데려온다. LoginScreen·ResetPasswordScreen이
        원래 이 모양이었고, 키보드가 떠도 버튼이 키보드 위에 남는 것을 기기에서 확인했다.
      */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          accessibilityRole="button"
          disabled={!canSubmit}
          onPress={submit}
          style={({ pressed }) => [styles.cta, !canSubmit && styles.ctaOff, pressed && canSubmit && styles.pressed]}
        >
          <Text style={styles.ctaText}>{signingIn ? '보내는 중…' : sent ? '다시 보내기' : '재설정 메일 받기'}</Text>
        </Pressable>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgRoot },
  pressed: { opacity: 0.85 },

  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headTitle: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 17, fontWeight: '800' },

  body: { paddingHorizontal: 24, paddingTop: 16, gap: 14 },
  desc: { color: colors.textMuted, fontSize: 13, fontWeight: '500', lineHeight: 20 },

  input: {
    height: 52,
    paddingHorizontal: 16,
    borderRadius: radius.button,
    backgroundColor: colors.inputBg,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: { color: colors.danger, fontSize: 12, fontWeight: '600' },
  noticeText: { color: colors.green, fontSize: 12, fontWeight: '600', lineHeight: 19 },
  suggestRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.button,
    backgroundColor: colors.goldTint,
    borderWidth: 1,
    borderColor: 'rgba(210,163,76,0.35)',
  },
  suggestText: { color: colors.gold, fontSize: 12, fontWeight: '600' },
  suggestStrong: { fontWeight: '800' },

  linkRow: { alignItems: 'center', paddingTop: 6 },
  linkText: { color: colors.textDim, fontSize: 12, fontWeight: '600' },

  footer: { paddingHorizontal: 24, paddingTop: 8 },
  cta: {
    height: 52,
    borderRadius: radius.button,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaOff: { opacity: 0.4 },
  ctaText: { color: colors.bgRoot, fontSize: 15, fontWeight: '800' },
  });
