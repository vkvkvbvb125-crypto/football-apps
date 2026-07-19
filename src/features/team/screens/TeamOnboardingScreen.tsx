import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTeamStore } from '../stores/teamStore';
import { usePendingInviteStore } from '../stores/pendingInviteStore';
import { useAuthStore } from '../../auth/stores/authStore';
import { ScreenGradient } from '../../../components/ScreenGradient';

type Mode = 'create' | 'join';

export function TeamOnboardingScreen() {
  const [mode, setMode] = useState<Mode>('create');
  const [teamName, setTeamName] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const loading = useTeamStore((s) => s.loading);
  const error = useTeamStore((s) => s.error);
  const createTeam = useTeamStore((s) => s.createTeam);
  const joinTeam = useTeamStore((s) => s.joinTeam);
  const signOut = useAuthStore((s) => s.signOut);

  const pendingInviteCode = usePendingInviteStore((s) => s.code);
  const clearPendingInvite = usePendingInviteStore((s) => s.clear);

  useEffect(() => {
    if (pendingInviteCode) {
      setMode('join');
      setInviteCode(pendingInviteCode);
      clearPendingInvite();
    }
  }, [pendingInviteCode]);

  const handleSubmit = () => {
    if (mode === 'create') {
      if (!teamName.trim()) return;
      createTeam(teamName.trim());
    } else {
      if (!inviteCode.trim()) return;
      joinTeam(inviteCode.trim());
    }
  };

  return (
    <ScreenGradient>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Pressable style={styles.signOutRow} onPress={signOut} hitSlop={8}>
        <Text style={styles.signOutText}>로그아웃</Text>
      </Pressable>

      <View style={styles.top}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoEmoji}>🏟️</Text>
        </View>
        <Text style={styles.title}>팀 시작하기</Text>
        <Text style={styles.subtitle}>
          {mode === 'create' ? '새 모임을 만들고 총무가 되어보세요' : '받은 초대코드로 팀에 합류하세요'}
        </Text>
      </View>

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, mode === 'create' && styles.tabActive]}
          onPress={() => setMode('create')}
        >
          <Text style={[styles.tabText, mode === 'create' && styles.tabTextActive]}>팀 만들기</Text>
        </Pressable>
        <Pressable style={[styles.tab, mode === 'join' && styles.tabActive]} onPress={() => setMode('join')}>
          <Text style={[styles.tabText, mode === 'join' && styles.tabTextActive]}>초대코드로 가입</Text>
        </Pressable>
      </View>

      {mode === 'create' ? (
        <TextInput
          style={styles.input}
          placeholder="팀 이름 (예: 강남 풋살 모임)"
          placeholderTextColor="#5A625E"
          value={teamName}
          onChangeText={setTeamName}
        />
      ) : (
        <TextInput
          style={styles.input}
          placeholder="초대 코드 입력"
          placeholderTextColor="#5A625E"
          value={inviteCode}
          onChangeText={setInviteCode}
          autoCapitalize="none"
        />
      )}

      <Pressable
        style={({ pressed }) => [styles.submitButton, pressed && styles.submitButtonPressed]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.submitButtonText}>{mode === 'create' ? '팀 만들기' : '가입하기'}</Text>
        )}
      </Pressable>

      {error && <Text style={styles.error}>{error}</Text>}
    </KeyboardAvoidingView>
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 28,
    justifyContent: 'center',
  },
  signOutRow: {
    position: 'absolute',
    top: 20,
    right: 20,
  },
  signOutText: {
    color: '#8A9490',
    fontSize: 13,
    fontWeight: '600',
  },
  top: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#141A17',
    borderWidth: 1,
    borderColor: '#22302A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoEmoji: {
    fontSize: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: '#8A9490',
    textAlign: 'center',
  },
  tabs: {
    flexDirection: 'row',
    marginBottom: 16,
    borderRadius: 10,
    backgroundColor: '#141A17',
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#22302A',
  },
  tabText: {
    color: '#8A9490',
    fontWeight: '600',
    fontSize: 13,
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  input: {
    borderWidth: 1,
    borderColor: '#22302A',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 14,
    backgroundColor: '#141A17',
    color: '#FFFFFF',
  },
  submitButton: {
    backgroundColor: '#39D98A',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonPressed: {
    opacity: 0.85,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  error: {
    marginTop: 16,
    color: '#F87171',
    textAlign: 'center',
    fontSize: 13,
  },
});
