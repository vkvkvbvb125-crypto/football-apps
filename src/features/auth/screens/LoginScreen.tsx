import { ActivityIndicator, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/authStore';
import { ScreenGradient } from '../../../components/ScreenGradient';

export function LoginScreen() {
  const signIn = useAuthStore((s) => s.signIn);
  const signingIn = useAuthStore((s) => s.signingIn);
  const error = useAuthStore((s) => s.error);
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  // 온보딩 인트로 화면과 동일하게 화면 폭 100% 기준(높이 제한 없이)
  const logoWidth = SCREEN_WIDTH;
  const logoHeight = logoWidth * 1.5;

  return (
    <ScreenGradient>
    <View style={styles.container}>
      <View style={styles.brand}>
        <Image
          source={require('../../../../assets/onbording-1.png')}
          style={[styles.logoImage, { width: logoWidth, height: logoHeight, marginHorizontal: -28 }]}
          resizeMode="contain"
        />
        <Text style={styles.brandName}>
          킥 <Text style={styles.brandNameAccent}>데이</Text>
        </Text>
        <Text style={styles.brandNameEn}>K I C K D A Y</Text>
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
              <Text style={styles.loginButtonText}>카카오톡으로 시작하기</Text>
            </View>
          )}
        </Pressable>

        <Text style={styles.footnote}>
          로그인 시 <Text style={styles.footnoteLink}>이용약관</Text> 및{' '}
          <Text style={styles.footnoteLink}>개인정보처리방침</Text>에{'\n'}동의하게 됩니다
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
    paddingTop: 48,
    paddingBottom: 40,
  },
  brand: {
    alignItems: 'center',
  },
  logoImage: {
    marginBottom: -60,
  },
  brandName: {
    fontSize: 44,
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
    borderRadius: 16,
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
    textAlign: 'center',
    lineHeight: 18,
  },
  footnoteLink: {
    color: '#4ADE80',
    textDecorationLine: 'underline',
  },
  error: {
    marginBottom: 12,
    color: '#F87171',
    textAlign: 'center',
    fontSize: 13,
  },
});
