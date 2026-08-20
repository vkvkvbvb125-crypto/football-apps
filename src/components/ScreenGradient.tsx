// src/components/ScreenGradient.tsx — 화면 공통 껍데기
// 배경 그라데이션 + 상단 안전영역. 아홉 화면이 이걸 쓴다.
// 상단 안전영역은 SafeAreaView(edges=['top'])가 담당한다 — 화면마다 insets.top을
// 따로 더하지 않아도 된다 (하단은 화면별로 다르게 써야 해서 여기서 다루지 않는다).
import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
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

/*
 * 배경은 초록이 아니라 밝기다.
 *
 * 한때 히어로 카드의 초록 빛을 화면 전체에 깔았는데, 그건 "Green은 강조색"이라는
 * 규칙과 정면으로 부딪힌다(스펙 02절: 모든 배경에 Green 금지). 배경이 초록이면
 * 정작 강조해야 할 CTA·활성 탭·핵심 숫자의 초록이 바탕에 섞여 안 보인다.
 *
 * 대신 밝기만 아주 옅게 흘린다 — 위는 배경색 그대로, 아래로 갈수록 미세하게 밝아진다.
 * bgRoot(#080B09)가 이미 옅은 초록기를 품고 있어서 밝히기만 해도 죽은 회색이 되지 않는다.
 * 값이 이전보다 작은 건 배경이 더 어두워졌기 때문이다 — 같은 알파도 검정 위에서 더 세다.
 */
const GRADIENT_TOP = 'rgba(255,255,255,0)';
const GRADIENT_MID = 'rgba(255,255,255,0.012)';
const GRADIENT_BOTTOM = 'rgba(255,255,255,0.032)';

/*
 * 초록 앰비언트 — 앱 전체 배경.
 *
 * 위 주석이 배경에 초록을 깔았다가 걷어낸 이력을 적어 뒀는데, 그때 문제는 초록 자체가
 * 아니라 세기였다. 배경이 "초록 화면"으로 읽히면 CTA·활성 탭의 초록이 바탕에 섞여
 * 강조가 죽는다. 여기 값은 그 선 아래다 — 중심 알파 0.15에서 #122B1B, 배경(#080B09)
 * 대비 L*가 12 오르는 게 전부다. 초록으로 인식되는 게 목적이 아니라 카드와 배경 사이에
 * 바닥이 하나 더 있는 것처럼 보이게 하는 게 목적이다.
 *
 * 세로 중심은 42%다. 정중앙이면 빛의 배꼽이 화면 한가운데에 오는데, 어느 화면이든
 * 눈이 먼저 가는 건 상단 카드라 그보다 조금 위여야 한다.
 *
 * 스크롤 밖(root 바로 아래)에 둬서 콘텐츠와 같이 움직이지 않는다 — 따라 움직이면
 * 배경이 아니라 큰 카드 뒤에 붙은 발광체로 읽힌다.
 *
 * export하는 이유: 인증 화면 넷은 ScreenGradient를 안 쓰고 KeyboardAvoidingView를
 * 자기 루트로 쓴다. 거기서도 같은 배경이어야 해서 이 조각만 따로 가져다 쓴다.
 */
const AMBIENT = colors.greenBright;

export function GreenAmbient() {
  /*
   * Svg에 크기를 숫자로 넘긴다. style={absoluteFill}만 주면 웹에서 상자가 0으로 접혀
   * 아무것도 안 그려진다 — 이 파일이 처음에 그래서 안 보였다. 앱의 다른 두 Svg
   * (스플래시 glow, 타이머 링)도 전부 width/height를 숫자로 넘기고 있다.
   *
   * Dimensions.get이 아니라 useWindowDimensions다. 전자는 값을 한 번 얼려서
   * 창 크기가 바뀌어도 그라데이션만 옛 크기로 남는다.
   */
  const { width, height } = useWindowDimensions();
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        {/*
         * rx/ry가 아니라 r이다. rx/ry는 react-native-svg의 확장이라 네이티브에서만 먹고,
         * 웹에서는 진짜 <radialGradient>로 나가면서 무시된다.
         * 기본 좌표계(objectBoundingBox)라 원이 상자 비율만큼 늘어난다 —
         * 세로로 긴 화면에서는 알아서 세로로 긴 타원이 된다.
         */}
        <RadialGradient id="screenAmbient" cx="50%" cy="42%" r="70%">
          {/*
           * 처음엔 0.04였는데 그 값은 원리적으로 안 보인다. 배경(#080B09)의 L*가 2.81인데
           * 0.04를 얹으면 2.3 오른다 — 색 패치를 맞대고 비교해야 겨우 구분되는 크기고,
           * 900px에 걸쳐 퍼지는 그라데이션은 비교할 경계 자체가 없다.
           *
           * 0.10이면 ΔL* 7.7 — "저기 뭔가 있다"까지는 오고 "초록 그라데이션이네"
           * (0.2 근처)까지는 안 간다. 세기를 만지려면 이 숫자 하나만 보면 된다.
           */}
          <Stop offset="0" stopColor={AMBIENT} stopOpacity={0.15} />
          {/* 중간 정거장이 없으면 선형으로 떨어져서 가장자리까지 초록기가 남는다 */}
          <Stop offset="0.55" stopColor={AMBIENT} stopOpacity={0.052} />
          <Stop offset="1" stopColor={AMBIENT} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill="url(#screenAmbient)" />
    </Svg>
  );
}

interface Props {
  children: ReactNode;
}

export function ScreenGradient({ children }: Props) {
  return (
    <View style={styles.root}>
      {/*
        글씨가 앉는 상단 12%는 비워 두고 아래로 갈수록 번지게 한다.
        세기를 두 번 틀린 적이 있다 — 0.22는 헤더 글씨를 묻었고, 아예 빼니 화면이 죽었다.
        답은 세기가 아니라 위치였다.

        카드보다 뒤에 있어야 하므로 children보다 먼저 그린다. pointerEvents="none"이 없으면
        이 레이어가 화면 전체의 터치를 먹는다.
      */}
      <LinearGradient
        colors={[GRADIENT_TOP, GRADIENT_MID, GRADIENT_BOTTOM]}
        locations={[0.12, 0.5, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* 밝기 그라데이션 위에 얹는다 — 둘 다 배경이라 순서로 카드를 가릴 일은 없다 */}
      <GreenAmbient />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgRoot },

});
