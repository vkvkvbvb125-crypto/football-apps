import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

interface Props extends PropsWithChildren {
  /** 하단 탭 네비게이터 바깥 화면(온보딩/팀 시작 등)에서는 false로 꺼야 한다 — 가릴 탭 바 자체가 없다. */
  navMask?: boolean;
}

export function ScreenGradient({ children, navMask = true }: Props) {
  return (
    <View style={styles.background}>
      {children}
      {/* 플로팅 하단 네비게이션 바 주변(좌우/아래 여백, 둥근 모서리)으로
          스크롤 콘텐츠가 비쳐 보이지 않도록 같은 색 배경으로 가려준다.
          실제 네비게이션 바는 이 화면 트리 바깥(Tab.Navigator)에서 더 위에 그려져
          그대로 보인다. */}
      {navMask && <View style={styles.navMask} pointerEvents="none" />}
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: '#0F1512',
  },
  navMask: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 80,
    backgroundColor: '#07100D',
  },
});
