// src/features/onboarding/screens/OnboardingScreen.tsx
// 진행 세그먼트 + 하단 고정 다음/이전 CTA. 마지막 장에서 로그인으로 넘어간다.
//
// 사진(onbording-*.png)을 걷어내고 앱 자체의 조형으로 다시 그렸다. 그 이미지들은
// 톤이 지금 킥데이(다크 + 초록 한 점, design.md)와 따로 놀았고, 화면마다 무슨 기능인지도
// 말해주지 못했다. 대신 정산 카드·참석 링에서 쓰는 원형 모티프를 그대로 가져와
// 기능 아이콘을 담는다 — 온보딩에서 본 형태를 앱 안에서 다시 만나게 된다.
import { useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Text } from '../../../components/nativeText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { colors, radius } from '../../../theme';

interface Slide {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  t1: string;
  t2: string;
  accent?: boolean;
  sub: string;
  /** 원 둘레를 얼마나 채울지 (0~1) — 장을 넘길수록 차오른다 */
  ring: number;
}

const SLIDES: Slide[] = [
  {
    label: 'KickDay 소개',
    icon: 'football-outline',
    t1: '풋살,',
    t2: '연결의 시작',
    accent: true,
    sub: '경기 찾기부터 팀 관리까지, KickDay와 함께',
    ring: 0.08,
  },
  {
    label: 'STEP 01',
    icon: 'people-outline',
    t1: '팀을 만들고',
    t2: '팀원을 초대하세요',
    sub: '초대 링크 하나로 팀 구성 완료',
    ring: 0.28,
  },
  {
    label: 'STEP 02',
    icon: 'calendar-outline',
    t1: '경기 일정을',
    t2: '쉽게 관리하세요',
    sub: '참석 투표와 일정 조율을 한눈에',
    ring: 0.48,
  },
  {
    label: 'STEP 03',
    icon: 'shuffle-outline',
    t1: '참석 인원으로',
    t2: '팀을 나눠보세요',
    sub: '랜덤 분배 후 필요하면 직접 조정할 수 있어요',
    ring: 0.68,
  },
  {
    label: 'STEP 04',
    icon: 'calculator-outline',
    t1: '회비 정산도',
    t2: '자동으로 계산해요',
    sub: '총무는 입금 확인만 하면 끝 — 송금은 은행 앱에서',
    ring: 0.88,
  },
  {
    label: 'STEP 05',
    icon: 'sparkles-outline',
    t1: 'KickDay와 함께',
    t2: '풋살을 시작해보세요',
    accent: true,
    sub: '간편 로그인으로 3초면 시작할 수 있어요',
    ring: 1,
  },
];

const EMBLEM = 188;
const RING_STROKE = 3;

interface Props {
  onDone: () => void;
}

export function OnboardingScreen({ onDone }: Props) {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;
  const insets = useSafeAreaInsets();

  // 장이 바뀔 때 아이콘·문구만 부드럽게 갈아끼운다 — 원(브랜드 모티프)은 자리를 지킨다
  const fade = useRef(new Animated.Value(1)).current;

  const goTo = (next: number) => {
    fade.setValue(0);
    setIndex(next);
    Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  };

  const segments = useMemo(() => SLIDES.map((_, i) => i), []);

  // 정산 카드의 ProgressRing과 같은 방식(stroke-dasharray)으로 원호를 그린다.
  // 반원을 회전시켜 만드는 CSS 트릭은 자르는 컨테이너 안에서 좌표가 어긋나 호가 밖으로 샜다.
  const ringRadius = (EMBLEM - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * ringRadius;

  return (
    <ScreenGradient>
      <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 16) + 14 }]}>
        <View style={styles.topRow}>
          <View style={styles.segments}>
            {segments.map((i) => (
              <View
                key={i}
                style={[
                  styles.segment,
                  { flex: i === index ? 1.8 : 1 },
                  i < index && styles.segmentPast,
                  i === index && styles.segmentNow,
                ]}
              />
            ))}
          </View>
          <Pressable onPress={onDone} hitSlop={8}>
            <Text style={styles.skip}>건너뛰기</Text>
          </Pressable>
        </View>

        <View style={styles.emblemArea}>
          <View style={styles.emblem}>
            {/* 바깥 진행 링 — 12시에서 시작해 시계방향으로 차오른다 */}
            <Svg width={EMBLEM} height={EMBLEM} style={StyleSheet.absoluteFill}>
              <Circle
                cx={EMBLEM / 2}
                cy={EMBLEM / 2}
                r={ringRadius}
                stroke={colors.border}
                strokeWidth={RING_STROKE}
                fill="none"
              />
              <Circle
                cx={EMBLEM / 2}
                cy={EMBLEM / 2}
                r={ringRadius}
                stroke={colors.green}
                strokeWidth={RING_STROKE}
                strokeLinecap="round"
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={circumference * (1 - slide.ring)}
                fill="none"
                transform={`rotate(-90 ${EMBLEM / 2} ${EMBLEM / 2})`}
              />
            </Svg>

            {/* 안쪽 원반 + 기능 아이콘 */}
            <View style={styles.emblemInner}>
              <Animated.View style={{ opacity: fade }}>
                <Ionicons name={slide.icon} size={62} color={colors.green} />
              </Animated.View>
            </View>
          </View>
        </View>

        <Animated.View style={[styles.copy, { opacity: fade }]}>
          <View style={styles.label}>
            <Text style={styles.labelText}>{slide.label}</Text>
          </View>
          <Text style={styles.title}>
            {slide.t1}
            {'\n'}
            <Text style={{ color: slide.accent ? colors.green : colors.text }}>{slide.t2}</Text>
          </Text>
          <Text style={styles.sub}>{slide.sub}</Text>
        </Animated.View>

        <View style={styles.ctaRow}>
          <Pressable
            disabled={index === 0}
            onPress={() => goTo(Math.max(0, index - 1))}
            style={[styles.prev, index === 0 && { opacity: 0.3 }]}
          >
            <Ionicons name="chevron-back" size={20} color={colors.textMuted} />
          </Pressable>
          <Pressable
            onPress={() => (isLast ? onDone() : goTo(index + 1))}
            style={({ pressed }) => [styles.next, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.nextText}>{isLast ? '시작하기' : '다음'}</Text>
          </Pressable>
        </View>
      </View>
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  // height:'100%'는 부모가 flex를 안 줘도 화면 전체를 차지하게 하는 보험
  root: { flex: 1, height: '100%', paddingHorizontal: 24, paddingTop: 8 },

  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 26 },
  segments: { flex: 1, flexDirection: 'row', gap: 5 },
  segment: { height: 3, borderRadius: 2, backgroundColor: colors.border },
  segmentPast: { backgroundColor: colors.greenDeep },
  segmentNow: { backgroundColor: colors.green },
  skip: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },

  // 엠블럼은 남는 공간만 차지하고, 하단 CTA를 절대 밀어내지 않는다
  emblemArea: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 120, alignItems: 'center', justifyContent: 'center' },
  emblem: { width: EMBLEM, height: EMBLEM, alignItems: 'center', justifyContent: 'center' },

  emblemInner: {
    width: EMBLEM - 34,
    height: EMBLEM - 34,
    borderRadius: (EMBLEM - 34) / 2,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    // 초록 한 점이 어둠에서 살짝 떠 보이게 — design.md의 "조명 아래" 톤
    shadowColor: colors.green,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },

  copy: { flexShrink: 0, alignItems: 'center', gap: 10, paddingTop: 18, paddingBottom: 22 },
  label: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.greenTint },
  labelText: { color: colors.green, fontSize: 10.5, fontWeight: '800', letterSpacing: 1 },
  title: {
    color: colors.text,
    fontSize: 29,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 37,
    textAlign: 'center',
  },
  sub: { color: colors.textMuted, fontSize: 14, fontWeight: '500', lineHeight: 21, textAlign: 'center' },

  ctaRow: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54 },
  prev: {
    width: 54,
    height: 54,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  next: {
    flex: 1,
    height: 54,
    borderRadius: radius.button,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.green,
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  nextText: { color: colors.bgRoot, fontSize: 15.5, fontWeight: '800' },
});
