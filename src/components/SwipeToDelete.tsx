// src/components/SwipeToDelete.tsx
// 옆으로 밀면 삭제 버튼이 나오는 행.
//
// 제스처 라이브러리를 새로 넣지 않고 내장 PanResponder를 쓴다 — 이 동작 하나에
// react-native-gesture-handler를 추가할 이유가 없다(RosterSheet의 시트 드래그와 같은 판단).
import { useRef } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './nativeText';
import { colors, radius } from '../theme';

/** 카드가 밀려나는 거리 */
const ACTION_W = 78;
/** 카드와 삭제 버튼 사이 틈 — 붙여 놓으면 한 덩어리로 보여 버튼이 눈에 안 띈다 */
const GAP = 10;
/** 버튼 자체의 폭. 밀려난 거리에서 틈만큼 뺀다 */
const BUTTON_W = ACTION_W - GAP;
/** 이만큼 넘게 밀면 손을 떼도 열린 채로 둔다 */
const OPEN_THRESHOLD = ACTION_W * 0.45;
/** 행 폭의 이 비율을 넘겨 밀면 버튼을 누르지 않아도 바로 지운다 (폰 알림처럼) */
const FULL_SWIPE_RATIO = 0.45;

interface Props {
  /**
   * 삭제 실행.
   *
   * Promise<false>를 돌려주면 되돌린다 — 공지처럼 확인창을 띄우는 경우
   * 사용자가 취소하면 밀려 나갔던 행이 제자리로 돌아와야 한다.
   */
  onDelete: () => void | Promise<boolean | void>;
  children: React.ReactNode;
}

export function SwipeToDelete({ onDelete, children }: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  /** 지금 열려 있는지 — 드래그 시작점을 잡는 데 쓴다 (Animated.Value는 동기로 못 읽는다) */
  const openRef = useRef(false);
  /** 행 폭 — 쭉 밀어 지울 때 얼마나 밀어낼지와 판정 기준에 쓴다 */
  const widthRef = useRef(0);

  const settle = (open: boolean) => {
    openRef.current = open;
    Animated.timing(translateX, {
      toValue: open ? -ACTION_W : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  };

  /** 화면 밖으로 밀어내고 지운다. 취소되면(Promise<false>) 제자리로 되돌린다 */
  const swipeAway = () => {
    openRef.current = false;
    const out = -(widthRef.current || ACTION_W * 4);
    Animated.timing(translateX, { toValue: out, duration: 190, useNativeDriver: true }).start(() => {
      const result = onDelete();
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        (result as Promise<boolean | void>).then((ok) => {
          if (ok === false) settle(false);
        });
      }
    });
  };

  const pan = useRef(
    PanResponder.create({
      // 가로로 확실히 움직일 때만 잡는다 — 세로를 가로채면 목록 스크롤이 안 된다
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_e, g) => {
        const base = openRef.current ? -ACTION_W : 0;
        // 쭉 미는 걸 허용해야 하므로 왼쪽 한계를 행 폭까지 연다.
        // (예전엔 버튼 폭 + 20에서 막혀 있어 "쭉 미는" 동작 자체가 불가능했다)
        const next = Math.min(0, Math.max(-(widthRef.current || 400), base + g.dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_e, g) => {
        const base = openRef.current ? -ACTION_W : 0;
        const ended = base + g.dx;

        // 폭을 아직 못 쟀으면(onLayout 전) 밀어내기 판정을 하지 않는다 —
        // 폭이 0이면 기준선도 0이라 1px만 밀어도 삭제로 판정된다.
        const measured = widthRef.current > 0;
        const fullSwipe = -(widthRef.current * FULL_SWIPE_RATIO);

        // 충분히 밀었거나 세게 튕겼으면 버튼을 거치지 않고 바로 지운다
        if (measured && (ended < fullSwipe || g.vx < -1.2)) return swipeAway();

        if (g.vx < -0.4) return settle(true);
        if (g.vx > 0.4) return settle(false);
        settle(ended < -OPEN_THRESHOLD);
      },
    })
  ).current;

  return (
    <View
      style={styles.wrap}
      onLayout={(e) => {
        widthRef.current = e.nativeEvent.layout.width;
      }}
    >
      {/* 뒤에 깔린 삭제 버튼 — 카드가 밀려나면서 드러난다.
          닫혀 있을 땐 투명하게 둔다. 카드의 둥근 모서리 바깥으로 뒤 색이 1px씩 비쳐서
          가만히 있어도 오른쪽에 붉은 기가 도는 게 보였다. */}
      <Animated.View
        style={[
          styles.actionLayer,
          {
            opacity: translateX.interpolate({
              inputRange: [-1, 0],
              outputRange: [1, 0],
              extrapolate: 'clamp',
            }),
          },
        ]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={() => {
            settle(false);
            onDelete();
          }}
          style={({ pressed }) => [styles.action, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="trash-outline" size={17} color={colors.danger} />
          <Text style={styles.actionText}>삭제</Text>
        </Pressable>
      </Animated.View>

      <Animated.View style={{ transform: [{ translateX }] }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  actionLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  action: {
    width: BUTTON_W,
    height: '100%',
    // 카드와 떨어져 있으니 네 모서리를 다 둥글게 — 카드와 같은 곡률이라 짝이 맞는다
    borderRadius: radius.card,
    // 검은 바탕 + 테두리는 카드만 한 면적에 쓰면 "카드가 하나 더 있는" 것처럼 보인다.
    // (테두리 스타일은 경기 종료처럼 가로로 긴 버튼에는 맞지만 여기선 안 맞았다)
    // 앱의 다른 배지들처럼 옅게 채워서 버튼 면으로 읽히게 한다.
    backgroundColor: colors.dangerTint,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  actionText: { color: colors.danger, fontSize: 11, fontWeight: '800' },
});
