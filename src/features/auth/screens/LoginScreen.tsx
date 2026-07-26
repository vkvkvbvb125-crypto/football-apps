// src/features/auth/screens/LoginScreen.tsx — 리디자인 적용판
// 상단 56%: 로고 이미지 + 글로우, 하단: 태그라인 + 카카오 CTA
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../stores/authStore';
import { colors } from '../../../theme';

export function LoginScreen() {
  const signIn = useAuthStore((s) => s.signIn);
  const signingIn = useAuthStore((s) => s.signingIn);
  const error = useAuthStore((s) => s.error);
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <LinearGradient
          colors={['rgba(74,222,128,0.22)', 'transparent']}
          style={styles.glow}
          start={{ x: 0.5, y: 0.2 }}
          end={{ x: 0.5, y: 1 }}
        />
        <Image
          source={require('../../../../assets/onbording-1.png')}
          resizeMode="contain"
          style={styles.logo}
        />
        <LinearGradient
          colors={['rgba(7,16,13,0.55)', 'rgba(7,16,13,0)', 'rgba(7,16,13,0.72)', colors.bgRoot]}
          locations={[0, 0.26, 0.76, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.wordmark}>
          <Text style={styles.brand}>
            킥 <Text style={{ color: colors.green }}>데이</Text>
          </Text>
          <Text style={styles.brandEn}>KICKDAY</Text>
        </View>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.tagline}>우리 팀의 매주 그 시간</Text>

        <View style={{ gap: 14, alignItems: 'center' }}>
          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <View style={styles.hintRow}>
            <View style={styles.dot} />
            <Text style={styles.hint}>가입 없이 카카오 계정으로 3초 시작</Text>
          </View>

          <Pressable
            onPress={signIn}
            disabled={signingIn}
            style={({ pressed }) => [styles.kakao, (pressed || signingIn) && styles.kakaoPressed]}
          >
            <Text style={styles.kakaoText}>{signingIn ? '카카오 연결 중…' : '카카오톡으로 시작하기'}</Text>
          </Pressable>

          <Text style={styles.terms}>
            로그인 시 이용약관 및 개인정보처리방침에{'\n'}동의하게 됩니다
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgRoot },

  hero: { height: '56%', overflow: 'hidden' },
  glow: { position: 'absolute', top: '-10%', left: '-20%', right: '-20%', bottom: 0 },
  logo: { position: 'absolute', top: '-2%', alignSelf: 'center', width: '104%', height: '104%' },
  wordmark: { position: 'absolute', left: 0, right: 0, bottom: 4, alignItems: 'center', gap: 6, paddingHorizontal: 28 },
  brand: {
    color: colors.text,
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: -1,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 24,
  },
  brandEn: { color: colors.green, fontSize: 11.5, fontWeight: '800', letterSpacing: 4.8 },

  bottom: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 28, paddingTop: 20 },
  tagline: { color: colors.textStrong, fontSize: 15, fontWeight: '600', letterSpacing: -0.2, textAlign: 'center' },

  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.green },
  hint: { color: colors.textDim, fontSize: 11.5, fontWeight: '600' },

  errorText: { color: colors.danger, fontSize: 13, textAlign: 'center' },

  kakao: {
    width: '100%',
    height: 56,
    borderRadius: 16,
    backgroundColor: '#FEE500',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FEE500',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  kakaoPressed: { backgroundColor: '#E6CF00' },
  kakaoText: { color: '#3C1E1E', fontSize: 15.5, fontWeight: '800' },

  terms: { color: colors.textDim, fontSize: 11.5, textAlign: 'center', lineHeight: 18 },
});
