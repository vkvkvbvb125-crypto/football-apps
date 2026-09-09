// src/components/Coachmark.tsx — 화면 위에 어두운 막을 덮고 한 곳만 뚫어 설명한다
//
// ── 왜 Modal + SVG 마스크인가 ──────────────────────────────────────
// 「구멍이 뚫린 막」은 검은 사각형 넷으로도 흉내 낼 수 있다. 그런데 모서리를 둥글게
// 하는 순간 넷으로는 안 된다 — 이 앱의 버튼은 전부 둥글다(radius.pill·radius.card).
// react-native-svg가 **이미 설치돼 있어서**(15.15.4) 새 의존성 없이 진짜 마스크를 쓴다.
//
// ⚠ 좌표는 `measureInWindow`로 잰다. 이 저장소가 이미 쓰는 방식이다 —
//   MatchDetailCard의 팝오버가 「전체 화면 Modal 안에 절대 위치로 뜨므로 화면
//   좌표가 필요하다」는 같은 이유로 그렇게 한다.
//
// ⚠ **재는 시점이 중요하다.** 화면이 그려지기 전에 재면 0이 나온다. 부르는 쪽이
//   `onLayout` 뒤에 재서 넘기고, 여기서는 받은 사각형을 그리기만 한다 —
//   재는 책임과 그리는 책임을 섞으면 화면마다 타이밍이 달라진다.
import { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './nativeText';
import { radius, type Palette } from '../theme';
import { useThemed } from '../lib/useThemed';
import { useReduceMotion } from '../lib/useReduceMotion';

/** 화면 좌표계의 사각형. measureInWindow가 주는 그대로다 */
export interface SpotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Props {
  visible: boolean;
  /** 뚫을 자리. null이면 막만 덮고 가운데에 말풍선을 띄운다 (짚을 것이 없는 단계) */
  spot: SpotRect | null;
  title: string;
  body: string;
  /** 「3단계 중 2번째」 — 끝이 언제인지 모르면 사람은 건너뛴다 */
  step: number;
  total: number;
  onNext: () => void;
  onSkip: () => void;
  /** 마지막 단계면 버튼이 「확인」 대신 「시작하기」가 된다 */
  isLast?: boolean;
}

/** 구멍 둘레의 여백 — 버튼에 딱 붙으면 뚫린 게 아니라 잘린 것으로 보인다 */
const PAD = 8;

export function Coachmark({ visible, spot, title, body, step, total, onNext, onSkip, isLast }: Props) {
  const { colors, styles } = useThemed(makeStyles);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();

  /* 단계가 바뀔 때 말풍선이 살짝 올라온다 — 같은 자리에서 글자만 바뀌면 바뀐 걸 놓친다 */
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    if (reduceMotion) {
      rise.setValue(1);
      return;
    }
    rise.setValue(0);
    Animated.timing(rise, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [visible, step, reduceMotion]);

  const hole = spot
    ? { x: spot.x - PAD, y: spot.y - PAD, w: spot.width + PAD * 2, h: spot.height + PAD * 2 }
    : null;

  /*
    말풍선을 구멍 위에 둘지 아래에 둘지.
    구멍이 화면 아래쪽(하단 탭 등)이면 위에, 위쪽이면 아래에 둔다 —
    구멍을 가리면 무엇을 짚는지 안 보인다.
  */
  const below = !hole || hole.y + hole.h < height * 0.45;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onSkip}>
      {/*
        막 자체는 안 눌린다 — 실수로 아무 데나 눌러 단계가 넘어가면
        읽기 전에 사라진다. 넘기는 것은 버튼으로만 한다.
      */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Defs>
            <Mask id="hole">
              {/* 흰 곳이 보이고 검은 곳이 뚫린다 */}
              <Rect x={0} y={0} width={width} height={height} fill="#fff" />
              {hole && (
                <Rect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx={radius.card} fill="#000" />
              )}
            </Mask>
          </Defs>
          <Rect x={0} y={0} width={width} height={height} fill={colors.scrim} mask="url(#hole)" />
        </Svg>

        {/* 뚫린 자리를 초록 테두리로 한 번 더 짚는다 — 어두운 화면에서 구멍만으로는 약하다 */}
        {hole && (
          <View
            pointerEvents="none"
            style={[
              styles.ring,
              { left: hole.x, top: hole.y, width: hole.w, height: hole.h },
            ]}
          />
        )}

        <Animated.View
          style={[
            styles.card,
            below
              ? { top: (hole ? hole.y + hole.h : height / 2) + 16 }
              : { bottom: height - (hole ? hole.y : height / 2) + 16 },
            {
              opacity: rise,
              transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            },
          ]}
        >
          <Text style={styles.step}>
            {step} / {total}
          </Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>

          <View style={styles.row}>
            <Pressable
              onPress={onSkip}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="튜토리얼 건너뛰기"
              style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
            >
              <Text style={styles.skipText}>건너뛰기</Text>
            </Pressable>
            <Pressable
              onPress={onNext}
              accessibilityRole="button"
              accessibilityLabel={isLast ? '튜토리얼 마치기' : '다음 단계'}
              style={({ pressed }) => [styles.next, pressed && styles.pressed]}
            >
              <Text style={styles.nextText}>{isLast ? '시작하기' : '확인'}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
      {/* 아래 여백만큼 말풍선이 시스템 바에 안 닿게 한다 */}
      <View pointerEvents="none" style={{ height: insets.bottom }} />
    </Modal>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
    ring: {
      position: 'absolute',
      borderRadius: radius.card,
      borderWidth: 2,
      borderColor: colors.green,
    },
    card: {
      position: 'absolute',
      left: 20,
      right: 20,
      backgroundColor: colors.cardRaised,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
      gap: 6,
    },
    step: { color: colors.green, fontSize: 12, fontWeight: '800' },
    title: { color: colors.text, fontSize: 17, fontWeight: '800' },
    body: { color: colors.textDim, fontSize: 13, fontWeight: '600', lineHeight: 20 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
    skip: { paddingVertical: 8, paddingHorizontal: 4 },
    skipText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
    next: {
      paddingVertical: 10,
      paddingHorizontal: 22,
      borderRadius: radius.pill,
      backgroundColor: colors.green,
    },
    nextText: { color: colors.bgRoot, fontSize: 14, fontWeight: '800' },
    pressed: { opacity: 0.85 },
  });
