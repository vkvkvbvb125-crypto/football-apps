// src/components/ScreenGradient.tsx — 리디자인 적용판
// 배경을 #07100D 단색 톤으로 통일하고, 상단에만 아주 옅은 초록 글로우를 둡니다.
// 상단 안전영역은 SafeAreaView(edges=['top'])가 담당한다 — 화면마다 insets.top을
// 따로 더하지 않아도 된다 (하단은 화면별로 다르게 써야 해서 여기서 다루지 않는다).
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme';

interface Props {
  children: ReactNode;
  /** 상단 글로우 제거 (풀블리드 화면용) */
  flat?: boolean;
}

export function ScreenGradient({ children, flat }: Props) {
  return (
    <View style={styles.root}>
      {!flat && (
        <LinearGradient
          colors={['rgba(74,222,128,0.06)', 'rgba(7,16,13,0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.glow}
          pointerEvents="none"
        />
      )}
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgRoot },
  glow: { position: 'absolute', left: 0, right: 0, top: 0, height: 260 },
});
