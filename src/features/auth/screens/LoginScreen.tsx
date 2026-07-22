import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
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
        <Image
          source={require('../../../../assets/3D구형.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
        <Text style={styles.brandName}>
          킥<Text style={styles.brandNameAccent}>데이</Text>
        </Text>
        <Text style={styles.brandNameEn}>KICKDAY</Text>
        <Text style={styles.tagline}>우리 팀의 매주 그 시간</Text>
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
              <Ionicons name="chatbubble" size={18} color="#3C1E1E" />
              <Text style={styles.loginButtonText}>카카오로 시작하기</Text>
            </View>
          )}
        </Pressable>

        <Text style={styles.footnote}>
          로그인 시 <Text style={styles.footnoteLink}>이용약관</Text> 및{' '}
          <Text style={styles.footnoteLink}>개인정보처리방침</Text>에 동의하게 됩니다
        </Text>
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
    paddingTop: 88,
    paddingBottom: 56,
  },
  brand: {
    alignItems: 'center',
  },
  logoImage: {
    width: 200,
    height: 300,
    marginBottom: 8,
  },
  brandName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  brandNameAccent: {
    color: '#4ADE80',
  },
  brandNameEn: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: '#4ADE80',
    letterSpacing: 4,
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
  loginButtonText: {
    color: '#3C1E1E',
    fontSize: 16,
    fontWeight: '700',
  },
  footnote: {
    marginTop: 16,
    color: '#8A9490',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  footnoteLink: {
    textDecorationLine: 'underline',
  },
  error: {
    marginBottom: 12,
    color: '#F87171',
    textAlign: 'center',
    fontSize: 13,
  },
});
