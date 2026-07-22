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
    icon: 'shield-outline',
    title: '팀을 만들고\n팀원을 초대하세요',
    subtitle: '초대 링크 하나로 팀 구성 완료!',
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
  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = useWindowDimensions();
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

  const introImageWidth = SCREEN_WIDTH;
  const introImageHeight = introImageWidth * 1.5;
  const introSlideMarginTop = -SCREEN_HEIGHT * 0.105;
  const introTextMarginTop = -SCREEN_HEIGHT * 0.098;

  const feature2ImageWidth = SCREEN_WIDTH * 0.8;
  const feature2ImageHeight = feature2ImageWidth * 1.5;

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
            <View
              key={i}
              style={[styles.slide, styles.introSlide, { width: SCREEN_WIDTH, marginTop: introSlideMarginTop }]}
            >
              <Image
                source={require('../../../../assets/onbording-1.png')}
                style={[
                  styles.introImage,
                  { width: introImageWidth, height: introImageHeight, marginHorizontal: -12 },
                ]}
                resizeMode="contain"
              />
              <View style={[styles.introTextBlock, { marginTop: introTextMarginTop }]}>
                <Text style={styles.introTitle}>
                  풋살,{'\n'}
                  <Text style={styles.titleAccent}>연결의 시작</Text>
                </Text>
                <Text style={styles.introSubtitle}>{slide.subtitle}</Text>
              </View>
            </View>
          ) : i === 1 ? (
            <View key={i} style={[styles.slide, { width: SCREEN_WIDTH }]}>
              <Image
                source={require('../../../../assets/onbording-2.png')}
                style={{ width: feature2ImageWidth, height: feature2ImageHeight }}
                resizeMode="contain"
              />
              <View style={styles.featureTextBlock}>
                <Text style={styles.stepNumber}>01</Text>
                <Text style={[styles.title, styles.centerText]}>{slide.title}</Text>
                <Text style={[styles.subtitle, styles.centerText]}>{slide.subtitle}</Text>
              </View>
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
  introSlide: {
    justifyContent: 'flex-start',
    paddingHorizontal: 12,
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
    marginBottom: 4,
  },
  introTextBlock: {
    alignItems: 'flex-start',
  },
  titleAccent: {
    color: '#4ADE80',
  },
  introTitle: {
    fontSize: 40,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'left',
    lineHeight: 42,
  },
  introSubtitle: {
    marginTop: 6,
    fontSize: 20,
    fontWeight: '400',
    color: '#8A9490',
    textAlign: 'left',
  },
  featureTextBlock: {
    alignItems: 'center',
    marginTop: 24,
  },
  centerText: {
    textAlign: 'center',
  },
  stepNumber: {
    color: '#4ADE80',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'left',
    lineHeight: 30,
  },
  subtitle: {
    marginTop: 12,
    fontSize: 14,
    color: '#8A9490',
    textAlign: 'left',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -84,
    gap: 12,
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
