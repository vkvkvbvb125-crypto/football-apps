// src/features/auth/screens/ResetPasswordScreen.tsx
// 메일의 재설정 링크로 들어왔을 때 새 비밀번호를 정하는 화면.
//
// 이 시점엔 이미 세션이 서 있다(링크의 토큰으로 로그인된 상태). 그래서 평소 규칙대로면
// 곧장 홈으로 들어가 버리는데, authStore.recoveryMode가 그걸 붙잡아 이 화면을 먼저 보여준다.
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from '../../../components/nativeText';
import { useAuthStore } from '../stores/authStore';
import { isValidPassword, MIN_PASSWORD } from '../password';
import { PasswordChecklist } from '../components/PasswordChecklist';
import { radius, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';
import { GreenAmbient } from '../../../components/ScreenGradient';

export function ResetPasswordScreen() {
  const { colors, styles } = useThemed(makeStyles);
  const updatePassword = useAuthStore((s) => s.updatePassword);
  const signingIn = useAuthStore((s) => s.signingIn);
  const error = useAuthStore((s) => s.error);
  const insets = useSafeAreaInsets();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = isValidPassword(password) && password === confirm && !signingIn;

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      {/* 앱 전체 공통 배경 — ScreenGradient를 안 쓰는 화면이라 조각만 가져다 쓴다 */}
      <GreenAmbient />
      <ScrollView
        contentContainerStyle={[styles.body, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>새 비밀번호 설정</Text>
        <Text style={styles.desc}>앞으로 이 비밀번호로 로그인하게 됩니다.</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder={`새 비밀번호 (${MIN_PASSWORD}자 이상)`}
            placeholderTextColor={colors.placeholder}
            secureTextEntry
            autoCapitalize="none"
            accessibilityLabel="새 비밀번호"
          />
          {password.length > 0 && <PasswordChecklist value={password} />}

          <TextInput
            style={styles.input}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="새 비밀번호 확인"
            placeholderTextColor={colors.placeholder}
            secureTextEntry
            autoCapitalize="none"
            accessibilityLabel="새 비밀번호 확인"
            returnKeyType="done"
            onSubmitEditing={() => canSubmit && updatePassword(password)}
          />
          {mismatch && <Text style={styles.fieldHint}>두 비밀번호가 서로 달라요</Text>}

          {!!error && <Text style={styles.errorText}>{error}</Text>}

        </View>
      </ScrollView>

      {/*
        ⚠ **버튼은 ScrollView 밖, KAV 안이다. 다섯 폼이 같은 기준이다.**

        창이 키보드 위로 줄면 그 마지막 형제가 키보드 바로 위에 선다
        (3ccf014에서 behavior="padding"으로 창이 실제로 줄게 됐다).

        ⚠ **글꼴 배율 200%가 이 기준을 강제했다.** 배율 1.0에서는 ScrollView 안에서도
          통과하던 화면들이(Login +44 · Forgot +228) 200% · 1080x1920에서 잘려
          각각 15px·9px만 보였다(2026-09-19 실측). 배율은 사용자가 접근성 설정으로
          올리므로 **우리가 안 건드려도 일어난다.**
        ⚠ 이 화면은 그 측정을 못 했다 — 재설정 링크가 있어야 닿는다. 같은 구조로
          맞춰 두고, 착지 페이지가 생기면 그때 잰다(⑸ 기기 확인 목록).
      */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          accessibilityRole="button"
          disabled={!canSubmit}
          onPress={() => updatePassword(password)}
          style={({ pressed }) => [styles.cta, !canSubmit && styles.ctaOff, pressed && canSubmit && styles.pressed]}
        >
          <Text style={styles.ctaText}>{signingIn ? '저장 중…' : '비밀번호 변경'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgRoot },
  pressed: { opacity: 0.85 },

  body: { paddingHorizontal: 24, gap: 8 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.6 },
  desc: { color: colors.textMuted, fontSize: 13, fontWeight: '500', marginBottom: 12 },

  form: { gap: 10 },
  input: {
    height: 52,
    paddingHorizontal: 16,
    borderRadius: radius.button,
    backgroundColor: colors.inputBg,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  fieldHint: { color: colors.gold, fontSize: 11, fontWeight: '600' },
  errorText: { color: colors.danger, fontSize: 12, fontWeight: '600' },

  cta: {
    height: 52,
    marginTop: 6,
    borderRadius: radius.button,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaOff: { opacity: 0.4 },
  /* 버튼이 ScrollView 밖으로 나가면서 생긴 바. 스크롤 내용과 붙지 않게 위를 띄운다 */
  footer: { paddingHorizontal: 24, paddingTop: 12 },
  ctaText: { color: colors.bgRoot, fontSize: 15, fontWeight: '800' },
  });
