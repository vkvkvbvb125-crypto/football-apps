// src/components/ScreenGradient.tsx — 리디자인 적용판
// 배경을 #07100D 단색 톤으로 통일하고, 상단에만 아주 옅은 초록 글로우를 둡니다.
// 상단 안전영역은 SafeAreaView(edges=['top'])가 담당한다 — 화면마다 insets.top을
// 따로 더하지 않아도 된다 (하단은 화면별로 다르게 써야 해서 여기서 다루지 않는다).
import type { ReactNode } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
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
        배경 깊이.

        한 번은 0.22로 너무 세서 헤더 글씨가 묻혔고, 한 번은 아예 빼서 화면이 죽었다.
        답은 세기가 아니라 위치였다 — 글씨가 앉는 상단은 비워 두고, 아래로 갈수록
        번지게 한다. 헤더는 깨끗하고 화면은 검은 판이 아니게 된다.
      */}
      <LinearGradient
        colors={[
          'rgba(74,222,128,0)',
          'rgba(74,222,128,0.04)',
          'rgba(74,222,128,0.12)',
        ]}
        locations={[0.15, 0.55, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgRoot },

});
