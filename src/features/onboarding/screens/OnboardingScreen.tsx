// src/features/onboarding/screens/OnboardingScreen.tsx — 리디자인 적용판
// 진행 세그먼트 + 하단 고정 다음/이전 CTA. 마지막 장에서 로그인으로 넘어간다.
import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/nativeText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenGradient } from '../../../components/ScreenGradient';
import { colors } from '../../../theme';

const SLIDES = [
  {
    img: require('../../../../assets/onbording-1.png'),
    label: '킥데이 소개',
    t1: '풋살,',
    t2: '연결의 시작',
    accent: true,
    sub: '경기 찾기부터 팀 관리까지, 킥데이와 함께',
  },
  {
    img: require('../../../../assets/onbording-2.png'),
    label: 'STEP 01',
    t1: '팀을 만들고',
    t2: '팀원을 초대하세요',
    sub: '초대 링크 하나로 팀 구성 완료',
  },
  {
    img: require('../../../../assets/onbording-3.png'),
    label: 'STEP 02',
    t1: '경기 일정을',
    t2: '쉽게 관리하세요',
    sub: '참가 여부와 일정 조율을 한눈에',
  },
  {
    img: require('../../../../assets/onbording-4.png'),
    label: 'STEP 03',
    t1: '참석 인원으로',
    t2: '팀을 나눠보세요',
    sub: '랜덤 분배 후 필요하면 직접 조정할 수 있어요',
  },
  {
    img: require('../../../../assets/onbording-5.png'),
    label: 'STEP 04',
    t1: '회비 정산도',
    t2: '자동으로 계산해요',
    sub: '총무는 입금 확인 체크만 하면 끝',
  },
  {
    img: require('../../../../assets/onbording-1.png'),
    label: 'STEP 05',
    t1: '킥데이와 함께',
    t2: '풋살을 시작해보세요',
    accent: true,
    sub: '카카오 계정으로 3초면 시작할 수 있어요',
  },
];

interface Props {
  onDone: () => void;
}

export function OnboardingScreen({ onDone }: Props) {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;
  const insets = useSafeAreaInsets();

  const fades = useMemo(() => SLIDES.map((_, i) => new Animated.Value(i === 0 ? 1 : 0)), []);

  const goTo = (next: number) => {
    Animated.parallel([
      Animated.timing(fades[index], { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(fades[next], { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start();
    setIndex(next);
  };

  return (
    <ScreenGradient>
      <View
        style={[
          styles.root,
          { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 16) + 14 },
        ]}
      >
        <View style={styles.topRow}>
          <View style={styles.segments}>
            {SLIDES.map((_, i) => (
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

        <View style={styles.imageArea}>
          {SLIDES.map((s, i) => (
            <Animated.Image
              key={i}
              source={s.img}
              resizeMode="contain"
              style={[StyleSheet.absoluteFill, { opacity: fades[i], width: '100%', height: '100%' }]}
            />
          ))}
        </View>

        <View style={styles.copy}>
          <View style={styles.label}>
            <Text style={styles.labelText}>{slide.label}</Text>
          </View>
          <Text style={styles.title}>
            {slide.t1}
            {'\n'}
            <Text style={{ color: slide.accent ? colors.green : colors.text }}>{slide.t2}</Text>
          </Text>
          <Text style={styles.sub}>{slide.sub}</Text>
        </View>

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
            <Text style={styles.nextText}>{isLast ? '카카오로 시작하기' : '다음'}</Text>
          </Pressable>
        </View>
      </View>
    </ScreenGradient>
  );
}

const styles = StyleSheet.create({
  // height:'100%'는 부모가 flex를 안 줘도 화면 전체를 차지하게 하는 보험
  root: { flex: 1, height: '100%', paddingHorizontal: 24 },

  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 26 },
  segments: { flex: 1, flexDirection: 'row', gap: 5 },
  segment: { height: 3, borderRadius: 2, backgroundColor: colors.border },
  segmentPast: { backgroundColor: '#2F4A3A' },
  segmentNow: { backgroundColor: colors.green },
  skip: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },

  // 이미지는 남는 공간만 차지하고, 하단 CTA를 절대 밀어내지 않는다
  imageArea: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 80, marginHorizontal: -18 },

  copy: { flexShrink: 0, alignItems: 'center', gap: 10, paddingTop: 18, paddingBottom: 22 },
  label: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(74,222,128,0.10)' },
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
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: '#26332D',
  },
  next: {
    flex: 1,
    height: 54,
    borderRadius: 16,
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
