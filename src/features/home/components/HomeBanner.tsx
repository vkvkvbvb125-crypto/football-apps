// src/features/home/components/HomeBanner.tsx — 홈 상단 배너 캐러셀
//
// 공과 글로우는 카드의 배경이라 슬라이드가 아니다. 페이지는 글자만 넘긴다 —
// 공까지 같이 밀면 슬라이드마다 공이 다시 그려지면서 튀고, 「공은 카드 오른쪽에
// 걸쳐 있다」는 구도가 전환 중에 무너진다.
//
// 높이는 heroLayout이 정한 값 하나를 모든 페이지가 그대로 쓴다. 페이지마다 내용
// 길이가 달라도 카드가 늘었다 줄었다 하면 아래 섹션이 통째로 밀린다.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  type ImageStyle,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '../../../components/nativeText';
import { colors, radius } from '../../../theme';
import { useReduceMotion } from '../../../lib/useReduceMotion';

/** 자동 전환 간격 */
const AUTO_MS = 5000;
/** 손으로 민 뒤 자동 전환이 다시 켜지기까지 */
const RESUME_MS = 10000;

export type BannerSlide =
  | { kind: 'brand' }
  | { kind: 'stat'; label: string; value: string; sub?: string }
  /**
   * 광고 자리. 지금은 배열에 넣지 않는다 — 타입과 슬롯만 미리 둔다.
   * 나중에 슬라이드 배열에 한 줄 넣으면 켜진다. SDK 연동은 별건이다.
   */
  | { kind: 'ad'; unitId: string };

/**
 * 광고 슬롯 — 지금은 아무것도 그리지 않는다.
 *
 * null을 돌려주는 컴포넌트를 미리 두는 이유는, 나중에 광고를 켤 때 배너 쪽 레이아웃
 * 코드를 다시 열지 않기 위해서다. 여기만 채우면 된다.
 */
export function AdSlot(_props: { unitId: string; height: number }) {
  return null;
}

interface Props {
  /** 값이 없는 슬라이드는 부르는 쪽에서 이미 빼고 넘긴다 */
  slides: BannerSlide[];
  /** heroLayout()이 준 값 — 높이와 공 배치 */
  layout: { height: number; img: ImageStyle };
  /** 공 이미지 */
  image: number;
  /**
   * 바깥 세로 스크롤이 진행 중인지. ref로 받는 이유는 상태로 올리면 스크롤할 때마다
   * 홈 화면 전체가 다시 그려지기 때문이다 — 여기서는 타이머만 보면 된다.
   */
  scrollingRef?: { current: boolean };
  onPress?: () => void;
}

export function HomeBanner({ slides, layout, image, scrollingRef, onPress }: Props) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  /** 손으로 민 직후 — RESUME_MS 동안 자동 전환을 멈춘다 */
  const [suspended, setSuspended] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFocused = useIsFocused();
  const reduceMotion = useReduceMotion();

  const count = slides.length;
  // 슬라이드가 줄어들면(데이터가 사라지면) 마지막 칸에 머물러 빈 화면이 된다
  const safeIndex = count === 0 ? 0 : Math.min(index, count - 1);

  /**
   * 자동 전환.
   *
   * 화면이 포커스를 잃으면 아예 걸지 않는다. 백그라운드에서 돌면 배터리를 쓰고,
   * 돌아왔을 때 보지도 않은 사이에 넘어간 엉뚱한 슬라이드에 있게 된다.
   */
  const auto = count > 1 && isFocused && !reduceMotion && !suspended && width > 0;

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => {
      // 세로로 스크롤하는 중에 가로가 저 혼자 넘어가면 잡고 있는 화면이 흔들린다
      if (scrollingRef?.current) return;
      setIndex((prev) => {
        const next = (prev + 1) % count;
        scroller.current?.scrollTo({ x: next * width, animated: true });
        return next;
      });
    }, AUTO_MS);
    return () => clearInterval(id);
  }, [auto, count, width]);

  // 언마운트 때 재개 타이머까지 확실히 끊는다 — 위 interval은 자기 effect가 정리한다
  useEffect(() => {
    return () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, []);

  /** 손이 닿으면 멈추고, 마지막 조작으로부터 RESUME_MS 뒤에 다시 켠다 */
  const noteInteraction = useCallback(() => {
    setSuspended(true);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setSuspended(false), RESUME_MS);
  }, []);

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (width <= 0) return;
      setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
    },
    [width],
  );

  const card = (
    <View style={[styles.card, { height: layout.height }]}>
      {/* RN엔 원형 그라디언트가 없어 대각선 LinearGradient로 근사한다 — 로그인 히어로와 같은 기법 */}
      <LinearGradient
        colors={['rgba(34,197,94,0.45)', 'rgba(34,197,94,0.1)', 'rgba(34,197,94,0)']}
        locations={[0, 0.3, 0.6]}
        start={{ x: 0.9, y: 0.05 }}
        end={{ x: 0.05, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* 알파가 있는 이미지라 뒤의 배경색이 그대로 비친다.
          aspectRatio + 절대배치는 RNW에서 크기가 안 잡혀 사라지므로 직접 계산한다. */}
      <Image source={image} style={[styles.image, layout.img]} resizeMode="cover" />

      {count <= 1 ? (
        // 한 장뿐이면 스크롤뷰를 두지 않는다 — 넘길 데가 없는데 가로 제스처만 먹는다
        <View style={[styles.page, { flex: 1 }]}>
          {slides[0] ? <Slide slide={slides[0]} height={layout.height} /> : null}
        </View>
      ) : (
        <ScrollView
          ref={scroller}
          horizontal
          /* 페이지 폭은 여기서 잰다. 카드 폭을 쓰면 테두리 2px이 섞여 페이지마다 어긋난다 */
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          pagingEnabled
          // 세로로 긋는 중에 가로가 딸려가지 않게 한다 (iOS)
          directionalLockEnabled
          showsHorizontalScrollIndicator={false}
          onScrollBeginDrag={noteInteraction}
          onMomentumScrollEnd={onMomentumEnd}
          scrollEventThrottle={16}
        >
          {slides.map((s, i) => (
            <View key={`${s.kind}-${i}`} style={[styles.page, { width, height: layout.height }]}>
              <Slide slide={s} height={layout.height} />
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );

  return (
    <View>
      {onPress ? (
        <Pressable onPress={onPress} accessibilityRole="button">
          {card}
        </Pressable>
      ) : (
        card
      )}

      {/* 인디케이터는 카드 바깥 아래. 한 장뿐이면 그리지 않는다 — 점 하나는 정보가 아니다 */}
      {count > 1 && (
        <View style={styles.dots}>
          {slides.map((s, i) => (
            <View key={`${s.kind}-${i}`} style={[styles.dot, i === safeIndex && styles.dotOn]} />
          ))}
        </View>
      )}
    </View>
  );
}

function Slide({ slide, height }: { slide: BannerSlide; height: number }) {
  if (slide.kind === 'ad') return <AdSlot unitId={slide.unitId} height={height} />;

  if (slide.kind === 'stat') {
    return (
      <View style={styles.text}>
        <Text style={styles.statLabel}>{slide.label}</Text>
        <Text style={styles.statValue}>{slide.value}</Text>
        {!!slide.sub && <Text style={styles.statSub}>{slide.sub}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.text}>
      <Text style={styles.brand}>
        <Text style={{ color: colors.green }}>Kick</Text>Day
      </Text>
      <Text style={styles.brandSub}>풋살, 연결의 시작</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    /* 좌우 여백은 HomeScreen의 content가 준다 — 여기서 또 주면 두 배가 된다 */
    borderRadius: radius.hero,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#0A100D',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  image: { position: 'absolute', right: 0 },
  /*
   * flex를 주지 않는다. 가로 스크롤뷰 안에서 flex:1이면 페이지가 제 폭을 갖지 못하고
   * 한 칸으로 눌려서, 인디케이터만 넘어가고 화면은 그대로인 상태가 된다.
   * 폭은 스크롤뷰가 잰 값을 그대로 받는다.
   */
  page: { justifyContent: 'center' },
  /*
   * 글자는 카드 폭의 55%까지만.
   * 공이 오른쪽에서 들어오므로, 좁은 화면에서 워드마크가 공 위로 겹치는 걸 막는다.
   */
  text: { paddingHorizontal: 22, gap: 6, maxWidth: '55%' },
  brand: { color: colors.text, fontSize: 34, fontWeight: '800', letterSpacing: -1.2 },
  brandSub: { color: colors.textBody, fontSize: 13, fontWeight: '600' },

  // 브랜드 슬라이드와 세로 리듬을 맞춘다 — 값이 워드마크 자리에 온다
  statLabel: { color: colors.textBody, fontSize: 13, fontWeight: '600' },
  statValue: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -1 },
  statSub: { color: colors.textFaint, fontSize: 12, fontWeight: '600' },

  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, paddingTop: 10 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.border },
  dotOn: { width: 16, borderRadius: 2, backgroundColor: colors.green },
});
