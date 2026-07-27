// src/features/team/screens/TeamStartScreen.tsx — 로그인 직후 팀 선택 단계 (리디자인 적용판)
// rn-code 원본은 팀 이름 입력이 없고(onCreate()만 호출) 초대 코드도 6칸 탭-삭제 전용
// 목업이라, 실제 8자리 invite_code 스펙(supabase/schema.sql)과 teamStore API에 맞춰
// 이름 입력 폼 + 실제 키보드 입력을 붙였다.
import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import type { TextInput as RNTextInput } from 'react-native';
import { Text, TextInput } from '../../../components/nativeText';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { colors } from '../../../theme';
import { useTeamStore } from '../stores/teamStore';
import { useAuthStore } from '../../auth/stores/authStore';
import { usePendingInviteStore } from '../stores/pendingInviteStore';

const CODE_LENGTH = 8;

export function TeamStartScreen() {
  const [pick, setPick] = useState<'create' | 'join' | null>(null);
  const [teamName, setTeamName] = useState('');
  const [code, setCode] = useState('');
  const codeInputRef = useRef<RNTextInput>(null);

  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);
  const loading = useTeamStore((s) => s.loading);
  const error = useTeamStore((s) => s.error);
  const createTeam = useTeamStore((s) => s.createTeam);
  const joinTeam = useTeamStore((s) => s.joinTeam);

  const pendingInviteCode = usePendingInviteStore((s) => s.code);
  const clearPendingInvite = usePendingInviteStore((s) => s.clear);

  useEffect(() => {
    if (pendingInviteCode) {
      setPick('join');
      setCode(pendingInviteCode);
      clearPendingInvite();
    }
  }, [pendingInviteCode]);

  const userName = (session?.user.user_metadata as { full_name?: string } | undefined)?.full_name ?? '회원';

  const handleCreate = () => {
    if (!teamName.trim()) return;
    createTeam(teamName.trim());
  };

  const handleJoin = () => {
    if (code.trim().length < CODE_LENGTH) return;
    joinTeam(code.trim());
  };

  return (
    <ScreenGradient navMask={false}>
      <View style={styles.root}>
        <Pressable onPress={signOut} hitSlop={8} style={styles.signOutRow}>
          <Text style={styles.signOutText}>로그아웃</Text>
        </Pressable>

        <View style={{ gap: 8, paddingTop: 10 }}>
          <View style={styles.greetRow}>
            <Image
              source={require('../../../../assets/kickday_logo.png')}
              style={{ width: 26, height: 26 }}
              resizeMode="contain"
            />
            <Text style={styles.greet}>{userName}님, 반가워요</Text>
          </View>
          <Text style={styles.title}>
            마지막 단계예요{'\n'}
            <Text style={{ color: colors.green }}>팀을 선택해주세요</Text>
          </Text>
        </View>

        <Pressable onPress={() => setPick('create')} style={[styles.card, pick === 'create' && styles.cardOn]}>
          <View style={styles.cardRow}>
            <View style={[styles.icon, { backgroundColor: 'rgba(74,222,128,0.14)' }]}>
              <Ionicons name="add" size={20} color={colors.green} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.cardTitle}>새 팀 만들기</Text>
              <Text style={styles.cardSub}>내가 총무가 되어 팀을 운영해요</Text>
            </View>
          </View>

          {pick === 'create' && (
            <View style={styles.inlineForm}>
              <TextInput
                style={styles.nameInput}
                placeholder="팀 이름 (예: 강남 풋살 모임)"
                placeholderTextColor={colors.placeholder}
                value={teamName}
                onChangeText={setTeamName}
              />
            </View>
          )}
        </Pressable>

        <Pressable onPress={() => setPick('join')} style={[styles.card, pick === 'join' && styles.cardOn]}>
          <View style={styles.cardRow}>
            <View style={[styles.icon, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
              <Ionicons name="arrow-forward" size={20} color={colors.textStrong} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.cardTitle}>초대 코드로 참여</Text>
              <Text style={styles.cardSub}>받은 {CODE_LENGTH}자리 코드를 입력해요</Text>
            </View>
          </View>

          {pick === 'join' && (
            <>
              <Pressable onPress={() => codeInputRef.current?.focus()} style={styles.codeRow}>
                {Array.from({ length: CODE_LENGTH }).map((_, i) => (
                  <View key={i} style={[styles.codeCell, i === code.length && styles.codeCellActive]}>
                    <Text style={styles.codeText}>{code[i] ?? ''}</Text>
                  </View>
                ))}
              </Pressable>
              <TextInput
                ref={codeInputRef}
                value={code}
                onChangeText={(t) => setCode(t.replace(/[^a-zA-Z0-9]/g, '').slice(0, CODE_LENGTH))}
                autoFocus
                autoCapitalize="none"
                style={styles.hiddenInput}
              />
            </>
          )}
        </Pressable>

        <View style={{ flex: 1 }} />

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <Text style={styles.note}>
          팀은 나중에 여러 개 만들 수도 있어요.{'\n'}초대 링크를 받았다면 링크만 눌러도 바로 참여됩니다.
        </Text>

        {pick === 'join' ? (
          <Pressable
            disabled={code.length < CODE_LENGTH || loading}
            onPress={handleJoin}
            style={[styles.cta, (code.length < CODE_LENGTH || loading) && { opacity: 0.4 }]}
          >
            <Text style={styles.ctaText}>{loading ? '참여 중…' : '참여하기'}</Text>
          </Pressable>
        ) : pick === 'create' ? (
          <Pressable
            disabled={!teamName.trim() || loading}
            onPress={handleCreate}
            style={[styles.cta, (!teamName.trim() || loading) && { opacity: 0.4 }]}
          >
            <Text style={styles.ctaText}>{loading ? '만드는 중…' : '만들기'}</Text>
          </Pressable>
        ) : null}
      </View>
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 34, gap: 18 },
  signOutRow: { position: 'absolute', top: 8, right: 24 },
  signOutText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  greetRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  greet: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  title: { color: colors.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.7, lineHeight: 34 },

  card: {
    borderRadius: 18,
    padding: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardOn: { backgroundColor: 'rgba(74,222,128,0.09)', borderColor: '#2F4A3A' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  cardSub: { color: colors.textMuted, fontSize: 12.5, fontWeight: '500' },

  inlineForm: { paddingTop: 14, marginTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
  nameInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14,
    backgroundColor: colors.inputBg,
  },

  codeRow: {
    flexDirection: 'row',
    gap: 6,
    paddingTop: 14,
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  codeCell: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeCellActive: { borderColor: colors.green },
  codeText: { color: colors.text, fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  hiddenInput: { position: 'absolute', width: 0, height: 0, opacity: 0 },

  errorText: { color: colors.danger, fontSize: 12.5, textAlign: 'center' },
  note: { color: '#5F6B66', fontSize: 11.5, textAlign: 'center', lineHeight: 18 },
  cta: { height: 52, borderRadius: 16, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: colors.bgRoot, fontSize: 15, fontWeight: '800' },
});
