// src/features/auth/screens/ResetPasswordScreen.tsx
// 메일의 재설정 링크로 들어왔을 때 새 비밀번호를 정하는 화면.
//
// 이 시점엔 이미 세션이 서 있다(링크의 토큰으로 로그인된 상태). 그래서 평소 규칙대로면
// 곧장 홈으로 들어가 버리는데, authStore.recoveryMode가 그걸 붙잡아 이 화면을 먼저 보여준다.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from '../../../components/nativeText';
import { useAuthStore } from '../stores/authStore';
import { isValidPassword, MIN_PASSWORD } from '../password';
import { PasswordChecklist } from '../components/PasswordChecklist';
import { colors, radius } from '../../../theme';
import { GreenAmbient } from '../../../components/ScreenGradient';

export function ResetPasswordScreen() {
  const updatePassword = useAuthStore((s) => s.updatePassword);
  const signingIn = useAuthStore((s) => s.signingIn);
  const error = useAuthStore((s) => s.error);
  const insets = useSafeAreaInsets();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = isValidPassword(password) && password === confirm && !signingIn;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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

          <Pressable
            disabled={!canSubmit}
            onPress={() => updatePassword(password)}
            style={({ pressed }) => [styles.cta, !canSubmit && styles.ctaOff, pressed && canSubmit && styles.pressed]}
          >
            <Text style={styles.ctaText}>{signingIn ? '저장 중…' : '비밀번호 변경'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
  ctaText: { color: colors.bgRoot, fontSize: 15, fontWeight: '800' },
});
