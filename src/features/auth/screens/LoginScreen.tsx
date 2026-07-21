import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/authStore';
import { ScreenGradient } from '../../../components/ScreenGradient';

export function LoginScreen() {
  const signIn = useAuthStore((s) => s.signIn);
  const signingIn = useAuthStore((s) => s.signingIn);
  const error = useAuthStore((s) => s.error);

  return (
    <ScreenGradient>
    <View style={styles.container}>
      <View style={styles.brand}>
        <View style={styles.logoCircle}>
          <Ionicons name="football-outline" size={40} color="#2D5F3E" />
        </View>
        <Text style={styles.brandName}>
          킥<Text style={styles.brandNameAccent}>데이</Text>
        </Text>
        <Text style={styles.tagline}>우리 팀 경기, 이제 더 쉽게</Text>
      </View>

      <View style={styles.bottom}>
        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={({ pressed }) => [styles.loginButton, pressed && styles.loginButtonPressed]}
          onPress={signIn}
          disabled={signingIn}
        >
          {signingIn ? (
            <ActivityIndicator color="#3C1E1E" />
          ) : (
            <View style={styles.loginButtonContent}>
              <View style={styles.kakaoBubble} />
              <Text style={styles.loginButtonText}>카카오톡으로 간편가입</Text>
            </View>
          )}
        </Pressable>

        <Text style={styles.footnote}>가입한 적 없다면 자동으로 계정이 만들어져요</Text>
      </View>
    </View>
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 140,
    paddingBottom: 56,
  },
  brand: {
    alignItems: 'center',
  },
  logoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#141A17',
    borderWidth: 1,
    borderColor: '#22302A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  brandName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  brandNameAccent: {
    color: '#2D5F3E',
  },
  tagline: {
    marginTop: 10,
    fontSize: 14,
    color: '#8A9490',
  },
  bottom: {
    width: '100%',
    alignItems: 'center',
  },
  loginButton: {
    width: '100%',
    backgroundColor: '#FEE500',
    paddingVertical: 16,
    borderRadius: 999,
    alignItems: 'center',
    boxShadow: '0px 6px 12px rgba(254,229,0,0.35)',
  },
  loginButtonPressed: {
    opacity: 0.88,
  },
  loginButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  kakaoBubble: {
    width: 17,
    height: 14,
    backgroundColor: '#3C1E1E',
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    borderBottomRightRadius: 7,
    borderBottomLeftRadius: 1,
  },
  loginButtonText: {
    color: '#3C1E1E',
    fontSize: 16,
    fontWeight: '700',
  },
  footnote: {
    marginTop: 16,
    color: '#8A9490',
    fontSize: 12,
  },
  error: {
    marginBottom: 12,
    color: '#F87171',
    textAlign: 'center',
    fontSize: 13,
  },
});
