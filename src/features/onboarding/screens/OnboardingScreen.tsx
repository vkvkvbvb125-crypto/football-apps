import { useRef, useState } from 'react';
import {
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOnboardingStore } from '../stores/onboardingStore';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { FieldBackground } from '../../../components/FieldBackground';

const SLIDES = [
  {
    icon: 'shield-outline',
    title: '풋살,\n연결의 시작',
    subtitle: '킥데이와 함께!',
  },
  {
    icon: 'cash-outline',
    title: '회비 정산도\n자동으로 계산해요',
    subtitle: '총무는 입금 확인 체크만 하면 끝',
  },
  {
    icon: 'stopwatch-outline',
    title: '오프라인에서도\n경기 타이머가 동작해요',
    subtitle: '쿼터 종료 알림까지 한 번에',
  },
  {
    icon: 'checkbox-outline',
    title: '참석 투표로\n인원을 빠르게 파악하세요',
    subtitle: '마감 시간이 지나면 자동으로 투표가 잠겨요',
  },
  {
    icon: 'people-outline',
    title: '참석 인원으로\n팀을 나눠보세요',
    subtitle: '랜덤 분배 후 필요하면 직접 조정할 수 있어요',
  },
] as const satisfies ReadonlyArray<{
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}>;

interface OnboardingScreenProps {
  onDone: () => void;
}

export function OnboardingScreen({ onDone }: OnboardingScreenProps) {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const markSeen = useOnboardingStore((s) => s.markSeen);
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const isLast = index === SLIDES.length - 1;

  const handleFinish = () => {
    markSeen();
    onDone();
  };

  const handleScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const newIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setIndex(newIndex);
  };

  return (
    <ScreenGradient>
    <View style={styles.container}>
      <View style={styles.skipRow}>
        <Pressable onPress={handleFinish} hitSlop={8}>
          <Text style={styles.skipText}>건너뛰기</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        onScroll={handleScrollEnd}
        scrollEventThrottle={16}
      >
        {SLIDES.map((slide, i) =>
          i === 0 ? (
            <View key={i} style={[styles.slide, { width: SCREEN_WIDTH }]}>
              <Image
                source={require('../../../../assets/onbording-1.png')}
                style={styles.introImage}
                resizeMode="contain"
              />
              <Text style={styles.introTitle}>
                풋살,{'\n'}
                <Text style={styles.titleAccent}>연결의 시작</Text>
              </Text>
              <Text style={styles.introSubtitle}>{slide.subtitle}</Text>
            </View>
          ) : (
            <View key={i} style={[styles.slide, { width: SCREEN_WIDTH }]}>
              <View style={styles.illustrationCard}>
                <FieldBackground variant="night" />
                <View style={styles.mainBadge}>
                  <Ionicons name={slide.icon} size={52} color="#FFFFFF" />
                </View>
              </View>
              <Text style={styles.title}>{slide.title}</Text>
              <Text style={styles.subtitle}>{slide.subtitle}</Text>
            </View>
          )
        )}
      </ScrollView>

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      {isLast && (
        <Pressable style={styles.startButton} onPress={handleFinish}>
          <Text style={styles.startButtonText}>시작하기</Text>
        </Pressable>
      )}
    </View>
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 56,
    paddingBottom: 40,
  },
  skipRow: {
    alignItems: 'flex-end',
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  skipText: {
    color: '#8A9490',
    fontSize: 14,
    fontWeight: '600',
  },
  slide: {
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustrationCard: {
    width: '100%',
    maxWidth: 340,
    maxHeight: 340,
    aspectRatio: 1,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#22302A',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 40,
    overflow: 'hidden',
  },
  mainBadge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  introImage: {
    width: 320,
    height: 480,
    marginBottom: 4,
  },
  titleAccent: {
    color: '#4ADE80',
  },
  introTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 40,
  },
  introSubtitle: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: '500',
    color: '#8A9490',
    textAlign: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 30,
  },
  subtitle: {
    marginTop: 12,
    fontSize: 14,
    color: '#8A9490',
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2A342F',
  },
  dotActive: {
    width: 20,
    backgroundColor: '#4ADE80',
  },
  startButton: {
    marginTop: 24,
    marginHorizontal: 28,
    backgroundColor: '#4ADE80',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    boxShadow: '0px 6px 12px rgba(74,222,128,0.35)',
  },
  startButtonText: {
    color: '#0F1512',
    fontSize: 16,
    fontWeight: '700',
  },
});
