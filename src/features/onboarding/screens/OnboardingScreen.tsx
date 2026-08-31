// src/features/onboarding/screens/OnboardingScreen.tsx
// 최초 실행 시 한 번 보는 3페이지 소개. 마지막 장에서 로그인으로 넘어간다.
//
// 구성은 레퍼런스를 따른다: 우상단 건너뛰기 / 초록 인덱스(01·02·03) / 큰 제목 / 두 줄 설명 /
// 기능을 상징하는 네온 비주얼 / 도트 / 전폭 CTA.
//
// 비주얼은 이미지 asset이 맡는다. 네온 라인아트의 글로우는 RN의 shadow나 그라디언트로
// 흉내낼 수 없다 — 억지로 View로 재현하면 레퍼런스와 다른 물건이 된다.
// asset이 아직 없는 동안에는 같은 크기의 자리만 잡아 두고, 도착하면 SLIDES의 visual에
// require 한 줄만 채우면 된다(레이아웃은 건드릴 필요 없다).
import { useRef, useState } from 'react';
import {
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../../components/nativeText';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { font, radius, type Palette } from '../../../theme';
import { useThemed } from '../../../lib/useThemed';
import { GreenFill } from '../../../components/Surface';

interface Slide {
  index: string;
  title: string;
  /** 두 줄로 끊어 쓴다 — 레퍼런스의 줄바꿈 위치를 그대로 따른다 */
  desc: string;
  cta: string;
  /**
   * 기능을 상징하는 네온 비주얼.
   *
   *   01 → assets/tut-schedule.png  캘린더 아웃라인 + 축구공
   *   02 → assets/tut-match.png     10:00 과 2 : 1 이 보이는 어두운 패널
   *   03 → assets/tut-settle.png    120,000원 카드 + 멤버 아이콘
   *
   * 도착하면 null을 require(...)로 바꾸기만 하면 된다.
   */
  visual: ImageSourcePropType | null;
}

const SLIDES: Slide[] = [
  {
    index: '01',
    title: '편리한 일정 관리',
    desc: '경기 일정을 만들고\n팀원들과 쉽게 공유하세요.',
    cta: '다음',
    visual: null,
  },
  {
    index: '02',
    title: '실시간 경기 운영',
    desc: '타이머, 스코어, 팀 분배까지\n경기를 더 쉽게 운영하세요.',
    cta: '다음',
    visual: null,
  },
  {
    index: '03',
    title: '정산과 팀 관리',
    desc: '정산 현황을 한눈에 확인하고\n우리 팀을 체계적으로 관리하세요.',
    cta: '킥데이 시작하기',
    visual: null,
  },
];

/** 비주얼이 놓이는 정사각 자리. asset이 와도 이 크기는 그대로다 */
const VISUAL = 240;

interface Props {
  onDone: () => void;
}

export function OnboardingScreen({ onDone }: Props) {
  const { colors, styles } = useThemed(makeStyles);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scroller = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  // CTA 글자는 마지막 장에서만 바뀐다 — 넘길 때 글자가 툭 갈리지 않게 살짝 페이드
  const ctaFade = useRef(new Animated.Value(1)).current;

  const settle = (next: number) => {
    if (next === index) return;
    setIndex(next);
    ctaFade.setValue(0.4);
    Animated.timing(ctaFade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  };

  /** 손가락으로 넘겼을 때 — 어느 장에 멈췄는지 스크롤 위치로 되짚는다 */
  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    settle(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  const goNext = () => {
    if (isLast) return onDone();
    const next = index + 1;
    scroller.current?.scrollTo({ x: next * width, animated: true });
    settle(next);
  };

  return (
    <ScreenGradient>
      <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 16) + 14 }]}>
        <View style={styles.top}>
          <Pressable onPress={onDone} hitSlop={14} accessibilityRole="button" accessibilityLabel="소개 건너뛰기">
            <Text style={styles.skip}>건너뛰기</Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
          style={styles.pager}
        >
          {SLIDES.map((s) => (
            <View key={s.index} style={[styles.page, { width }]}>
              <Text style={styles.index}>{s.index}</Text>
              <Text style={styles.title}>{s.title}</Text>
              <Text style={styles.desc}>{s.desc}</Text>

              <View style={styles.visualSlot}>
                {s.visual ? (
                  <Image source={s.visual} style={styles.visual} resizeMode="contain" />
                ) : (
                  // asset 대기 중. 자리를 비워 두면 넘길 때 화면 높이가 장마다 달라져
                  // 도트와 CTA가 위아래로 흔들린다 — 같은 크기의 빈 칸으로 잡아 둔다.
                  <View style={styles.visualPending} />
                )}
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.dots}>
          {SLIDES.map((s, i) => (
            <View key={s.index} style={[styles.dot, i === index && styles.dotOn]} />
          ))}
        </View>

        <Animated.View style={{ opacity: ctaFade }}>
          <Pressable
            onPress={goNext}
            accessibilityRole="button"
            accessibilityLabel={slide.cta}
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}
          >
            <GreenFill />
            <Text style={styles.ctaText}>{slide.cta}</Text>
          </Pressable>
        </Animated.View>
      </View>
    </ScreenGradient>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  root: { flex: 1, height: '100%', paddingTop: 8 },

  // 건너뛰기만 있는 줄. 페이저가 화면 폭을 그대로 써야 해서 좌우 여백은 페이지가 각자 갖는다
  top: { alignItems: 'flex-end', paddingHorizontal: 24, height: 30, justifyContent: 'center' },
  skip: { ...font.body, color: colors.textMuted, fontWeight: '700' },

  pager: { flexGrow: 1, flexShrink: 1 },
  page: { paddingHorizontal: 24, paddingTop: 18, alignItems: 'flex-start' },

  index: { ...font.title, ...font.num, color: colors.green, marginBottom: 14 },
  title: { ...font.hero, color: colors.text, marginBottom: 10 },
  desc: { ...font.cardTitle, color: colors.textMuted, fontWeight: '500', lineHeight: 22 },

  // 비주얼은 남는 공간의 가운데. 글과 붙지 않게 위로 여백을 준다
  visualSlot: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', paddingTop: 28 },
  visual: { width: VISUAL, height: VISUAL },
  visualPending: { width: VISUAL, height: VISUAL },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 20 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotOn: { width: 18, backgroundColor: colors.green },

  cta: {
    overflow: 'hidden', // GreenFill을 모서리 안에 가둔다
    marginHorizontal: 24,
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { ...font.section, color: colors.bgRoot },
  });
