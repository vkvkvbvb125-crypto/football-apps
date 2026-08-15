// src/components/ScreenGradient.tsx — 리디자인 적용판
// 배경을 #07100D 단색 톤으로 통일하고, 상단에만 아주 옅은 초록 글로우를 둡니다.
// 상단 안전영역은 SafeAreaView(edges=['top'])가 담당한다 — 화면마다 insets.top을
// 따로 더하지 않아도 된다 (하단은 화면별로 다르게 써야 해서 여기서 다루지 않는다).
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, tabBar } from '../theme';

/**
 * 스크롤 콘텐츠가 떠 있는 탭바에 가리지 않도록 두는 아래 여백.
 *
 * 화면마다 110처럼 숫자를 박아 뒀는데, 탭바는 홈 인디케이터 위로 insets.bottom만큼 더
 * 올라가 있어서 노치 기기에서는 그만큼 모자랐다 — 마지막 줄이 탭바 뒤에 깔렸다.
 */
export function useTabBarPadding() {
  return useSafeAreaInsets().bottom + tabBar.gap + tabBar.height + 16;
}

interface Props {
  children: ReactNode;
  /** 상단 글로우 제거 (풀블리드 화면용) */
  flat?: boolean;
}

export function ScreenGradient({ children }: Props) {
  return (
    <View style={styles.root}>
      {/*
        화면 전체에 깔리는 초록 그라데이션.

        예전엔 상단 260px에만 0.06짜리 글로우를 얹었는데, 그 정도로는 보이지 않는 데다
        카드가 화면 대부분을 덮어서 남는 자리가 없었다. 전체 높이로 늘리고 위·아래를
        모두 물들여, 카드 사이 여백마다 초록이 드러나게 한다.

        카드보다 뒤에 있어야 하므로 children보다 먼저 그린다.
      */}
      {/*
        배경 글로우를 걷어냈다.

        면을 무채색으로 돌리고 나니 초록 그라데이션이 배경만 탁하게 만들 뿐이었다.
        두 번에 걸쳐 0.22 → 0.12로 낮춰 왔던 그 값인데, 중성 배경에서는 아예 없는
        편이 낫다 — 초록은 강조가 필요한 자리에만 남긴다.
        flat prop은 호출부를 건드리지 않으려고 남겨 뒀다.
      */}
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgRoot },

});
