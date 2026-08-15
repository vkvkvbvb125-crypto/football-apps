// src/features/auth/screens/SignUpScreen.tsx
// 회원가입 — 이름 · 이메일 · 비밀번호 + 약관 동의.
//
// 약관 동의는 장식이 아니다. 국내 앱은 개인정보 수집·이용 동의를 받아야 하고,
// 스토어 심사에도 개인정보처리방침 링크가 필요하다(futsal-app-spec 메모의 배포 준비 항목).
// 문서 URL이 아직 없어 링크는 url이 채워진 항목에만 붙는다 — 없는 링크를 눌러 빈 화면이
// 뜨는 것보다 낫다.
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from '../../../components/nativeText';
import { useAuthStore } from '../stores/authStore';
import { TERMS, type TermDoc } from '../terms';
import { isValidEmail, suggestEmailFix, EMAIL_FORMAT_HINT } from '../email';
import { isValidPassword, MIN_PASSWORD } from '../password';
import { PasswordChecklist } from '../components/PasswordChecklist';
import { colors, radius } from '../../../theme';

export function SignUpScreen({ navigation }: { navigation: any }) {
  const signUpWithEmail = useAuthStore((s) => s.signUpWithEmail);
  const signingIn = useAuthStore((s) => s.signingIn);
  const error = useAuthStore((s) => s.error);
  const needsEmailConfirm = useAuthStore((s) => s.needsEmailConfirm);
  const clearError = useAuthStore((s) => s.clearError);
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  /** 전문을 펼쳐 볼 약관 — null이면 닫힌 상태 */
  const [openDoc, setOpenDoc] = useState<TermDoc | null>(null);

  const requiredKeys = TERMS.filter((t) => t.required).map((t) => t.key);
  const allAgreed = TERMS.every((t) => agreed[t.key]);
  const requiredAgreed = requiredKeys.every((k) => agreed[k]);

  const toggle = (key: string) => setAgreed((p) => ({ ...p, [key]: !p[key] }));
  const toggleAll = () => {
    const next = !allAgreed;
    setAgreed(Object.fromEntries(TERMS.map((t) => [t.key, next])));
  };

  // 가입 때 이메일을 잘못 넣으면 나중에 비밀번호를 잃었을 때 복구할 방법이 아예 없다 —
  // 형식이 맞을 때만 가입 버튼이 열린다.
  const emailOk = isValidEmail(email);
  const emailTyped = email.trim().length > 0;
  const suggestion = emailOk ? suggestEmailFix(email) : null;

  const canSubmit =
    name.trim().length > 0 && emailOk && isValidPassword(password) && requiredAgreed && !signingIn;

  const submit = () => {
    if (!canSubmit) return;
    clearError();
    signUpWithEmail(email, password, name);
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.head, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textStrong} />
        </Pressable>
        <Text style={styles.headTitle}>회원가입</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.field}>
          <Text style={styles.label}>이름</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="팀에 보일 이름"
            placeholderTextColor={colors.placeholder}
            accessibilityLabel="이름"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>이메일</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="kickday@example.com"
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            accessibilityLabel="이메일"
          />
          {emailTyped && !emailOk && (
            <Text style={styles.fieldHint}>{EMAIL_FORMAT_HINT}</Text>
          )}
          {/* 형식은 맞지만 도착하지 않을 주소 — 눌러서 바로 고칠 수 있게 한다 */}
          {!!suggestion && (
            <Pressable onPress={() => setEmail(suggestion)} hitSlop={4}>
              <Text style={styles.fieldHint}>
                혹시 <Text style={{ fontWeight: '800' }}>{suggestion}</Text> 아닌가요? 눌러서 바꾸기
              </Text>
            </Pressable>
          )}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>비밀번호</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder={`${MIN_PASSWORD}자 이상`}
            placeholderTextColor={colors.placeholder}
            secureTextEntry
            autoCapitalize="none"
            accessibilityLabel="비밀번호"
          />
          {/* 입력을 시작해야 뜬다 — 빈 화면부터 조건 네 줄이 깔려 있으면 그것부터 부담이다 */}
          {password.length > 0 && <PasswordChecklist value={password} />}
        </View>

        {/* 약관 — 전체 동의가 위, 개별 항목이 아래 */}
        <View style={styles.terms}>
          <Pressable onPress={toggleAll} style={styles.termAllRow}>
            <CheckBox on={allAgreed} big />
            <Text style={styles.termAllText}>모두 동의합니다</Text>
          </Pressable>

          <View style={styles.termDivider} />

          {TERMS.map((t) => (
            <View key={t.key} style={styles.termRow}>
              <Pressable onPress={() => toggle(t.key)} hitSlop={6} style={styles.termTapArea}>
                <CheckBox on={!!agreed[t.key]} />
                <Text style={styles.termText}>
                  <Text style={t.required ? styles.termRequired : styles.termOptional}>
                    [{t.required ? '필수' : '선택'}]
                  </Text>{' '}
                  {t.label}
                </Text>
              </Pressable>
              <Pressable onPress={() => setOpenDoc(t)} hitSlop={10} accessibilityLabel={`${t.label} 전문 보기`}>
                <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
              </Pressable>
            </View>
          ))}
        </View>

        {!!error && <Text style={styles.errorText}>{error}</Text>}
        {needsEmailConfirm && (
          <Text style={styles.noticeText}>
            가입 확인 메일을 보냈어요. 메일함에서 인증하면 로그인할 수 있어요.
          </Text>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          disabled={!canSubmit}
          onPress={submit}
          style={({ pressed }) => [styles.cta, !canSubmit && styles.ctaOff, pressed && canSubmit && styles.pressed]}
        >
          <Text style={styles.ctaText}>{signingIn ? '잠시만요…' : '가입하기'}</Text>
        </Pressable>
      </View>

      {/* 약관 전문 — 읽고 바로 동의까지 할 수 있게 한다(닫고 다시 체크하러 가지 않도록) */}
      <Modal visible={!!openDoc} transparent animationType="fade" onRequestClose={() => setOpenDoc(null)}>
        <View style={styles.docOverlay}>
          <Pressable style={styles.docBackdrop} onPress={() => setOpenDoc(null)} />
          <View style={styles.docCard}>
            <View style={styles.docHead}>
              <Text style={styles.docTitle}>{openDoc?.title}</Text>
              <Text style={[styles.docBadge, openDoc?.required ? styles.docRequired : styles.docOptional]}>
                {openDoc?.required ? '필수' : '선택'}
              </Text>
            </View>

            <ScrollView style={styles.docScroll} contentContainerStyle={styles.docBody}>
              <Text style={styles.docText}>{openDoc?.body}</Text>
            </ScrollView>

            <View style={styles.docFooter}>
              <Pressable
                onPress={() => setOpenDoc(null)}
                style={({ pressed }) => [styles.docClose, pressed && styles.pressed]}
              >
                <Text style={styles.docCloseText}>닫기</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (openDoc) setAgreed((p) => ({ ...p, [openDoc.key]: true }));
                  setOpenDoc(null);
                }}
                style={({ pressed }) => [styles.docAgree, pressed && styles.pressed]}
              >
                <Text style={styles.docAgreeText}>동의합니다</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function CheckBox({ on, big }: { on: boolean; big?: boolean }) {
  const size = big ? 22 : 20;
  return (
    <View
      style={[
        styles.check,
        { width: size, height: size, borderRadius: size / 2 },
        on ? styles.checkOn : styles.checkOff,
      ]}
    >
      <Ionicons name="checkmark" size={big ? 14 : 13} color={on ? colors.bgRoot : colors.textFaint} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgRoot },
  pressed: { opacity: 0.85 },

  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headTitle: { flex: 1, textAlign: 'center', color: colors.text, fontSize: 16, fontWeight: '800' },

  body: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20, gap: 16 },
  field: { gap: 7 },
  label: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
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
  fieldHint: { color: colors.gold, fontSize: 11.5, fontWeight: '600' },

  // ── 약관 ──────────────────────────────────────────────
  terms: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  termAllRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  termAllText: { color: colors.text, fontSize: 14.5, fontWeight: '800' },
  termDivider: { height: 1, backgroundColor: colors.divider, marginHorizontal: -16 },
  termRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  termTapArea: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  termText: { flex: 1, color: colors.textBody, fontSize: 13, fontWeight: '500' },
  termRequired: { color: colors.green, fontWeight: '800' },
  termOptional: { color: colors.textDim, fontWeight: '800' },

  check: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  checkOn: { backgroundColor: colors.green, borderColor: colors.green },
  checkOff: { backgroundColor: 'transparent', borderColor: colors.border },

  errorText: { color: colors.danger, fontSize: 12.5, fontWeight: '600' },
  noticeText: { color: colors.green, fontSize: 12.5, fontWeight: '600', lineHeight: 18 },

  // ── 약관 전문 모달 ────────────────────────────────────
  docOverlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.72)' },
  docBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  docCard: {
    // 화면을 다 덮지 않는다 — 뒤가 보여야 "잠깐 열어본 것"으로 읽힌다
    maxHeight: '78%',
    backgroundColor: colors.card,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  docHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  docTitle: { flex: 1, color: colors.text, fontSize: 15.5, fontWeight: '800', letterSpacing: -0.3 },
  docBadge: { fontSize: 11, fontWeight: '800' },
  docRequired: { color: colors.green },
  docOptional: { color: colors.textDim },

  docScroll: { flexGrow: 0 },
  docBody: { paddingHorizontal: 18, paddingVertical: 16 },
  // 조항이 많아 줄 간격을 넉넉히 — 좁으면 읽다가 줄을 놓친다
  docText: { color: colors.textBody, fontSize: 13, fontWeight: '500', lineHeight: 21 },

  docFooter: {
    flexDirection: 'row',
    gap: 8,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  docClose: {
    flex: 1,
    height: 46,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  docCloseText: { color: colors.textStrong, fontSize: 14, fontWeight: '700' },
  docAgree: {
    flex: 1,
    height: 46,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.green,
  },
  docAgreeText: { color: colors.bgRoot, fontSize: 14, fontWeight: '800' },

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
