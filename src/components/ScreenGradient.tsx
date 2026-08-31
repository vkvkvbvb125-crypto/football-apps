// src/components/ScreenGradient.tsx — 화면 공통 껍데기
// 배경 그라데이션 + 상단 안전영역. 아홉 화면이 이걸 쓴다.
// 상단 안전영역은 SafeAreaView(edges=['top'])가 담당한다 — 화면마다 insets.top을
// 따로 더하지 않아도 된다 (하단은 화면별로 다르게 써야 해서 여기서 다루지 않는다).
import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { tabBar, type Palette } from '../theme';
import { useThemeName, useThemed } from '../lib/useThemed';

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
/*
  ⚠ 방향이 테마마다 뒤집힌다. 다크에서는 아래로 갈수록 **밝아지고**, 라이트에서는
    **어두워진다.** 같은 값을 쓰면 라이트에서 흰 위에 흰색이라 아무것도 안 보인다.
    「배경이 밑에서 살짝 뜬다」는 뜻을 지키려면 얹는 색이 바뀌어야 한다.
    (다크 값이 0.012/0.032로 작은 이유는 배경이 거의 검정이라 같은 알파도 세게
     먹기 때문이다 — 라이트는 흰색이라 더 작아야 한다.)
*/
const GRADIENT = {
  dark: ['rgba(255,255,255,0)', 'rgba(255,255,255,0.012)', 'rgba(255,255,255,0.032)'] as const,
  light: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.008)', 'rgba(0,0,0,0.022)'] as const,
};

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
/* 테마마다 값이 다르므로 표를 함수로 바꿨다 — 모듈 최상단에서 만들면 굳는다 */
const ambientOf = (colors: Palette) => colors.greenBright;

export function GreenAmbient() {
  const { colors, styles } = useThemed(makeStyles);
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
          <Stop offset="0" stopColor={ambientOf(colors)} stopOpacity={0.15} />
          {/* 중간 정거장이 없으면 선형으로 떨어져서 가장자리까지 초록기가 남는다 */}
          <Stop offset="0.55" stopColor={ambientOf(colors)} stopOpacity={0.052} />
          <Stop offset="1" stopColor={ambientOf(colors)} stopOpacity={0} />
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
  const themeName = useThemeName();
  const { colors, styles } = useThemed(makeStyles);
  return (
    <View style={styles.root}>
      {/*
        글씨가 앉는 상단 12%는 비워 두고 아래로 갈수록 번지게 한다.
        세기를 두 번 틀린 적이 있다 — 0.22는 헤더 글씨를 묻었고, 아예 빼니 화면이 죽었다.
        답은 세기가 아니라 위치였다.

        카드보다 뒤에 있어야 하므로 children보다 먼저 그린다. pointerEvents="none"이 없으면
        이 레이어가 화면 전체의 터치를 먹는다.
      */}
      {/*
        ⚠ 이 그라데이션과 아래 GreenAmbient를 따로 손보지 마라.
          두 레이어의 **겹침이 이미 디더링 역할**을 하고 있다. 실기기에서
          하나씩 꺼가며 쟀다 (정산 화면 왼쪽 여백 기둥, 고유색 / 최대 계단):

              둘 다 (지금)        40개 / 177px
              GreenAmbient 끔     18개 / 401px
              ScreenGradient 끔   23개 / 296px

          각자 혼자면 훨씬 심하다. 겹치면 서로의 계단 위치가 어긋나 고유색이
          늘고 띠가 좁아진다. 우연히 얻은 효과지만 실제로 듣고 있다.

        ⚠ 그래서 「밝아지는 구간을 아래로 몰아 거리를 줄이자」가 역효과다.
          실제로 해봤다 — locations를 [0.55, 0.8, 1]로 옮기니 최대 계단이
          177px에서 296px로 **늘었다.** 한쪽 활성 구간을 좁히면 나머지 구간에서
          겹침이 사라져 그 레이어 혼자가 되기 때문이다. 되돌렸다.

        ⚠ 정지점을 늘리는 것(2개 → 4~5개)도 소용없다. 최종 색 범위가 12단계면
          중간색은 어차피 12개뿐이고 계단의 위치만 바뀐다.

        ⚠ 알파를 올려 단계를 늘리는 것도 안 한다 — 위 주석대로 0.22가 헤더
          글씨를 묻은 이력이 있다. 세기는 판단이 끝난 값이다.

        지금 눈에 보이는가: 순수 배경의 계단은 ΔL* 0.41(최대 0.66)이다.
        「나란히 놓고 겨우 구분」이 1.0이니 그 절반도 안 된다. 1:1로는 매끄럽고
        대비를 20배 올려야 띠가 드러난다. 그래서 노이즈 오버레이도 안 넣었다.
        (실기기 OLED는 어두운 장면에서 더 잘 보인다 — 거기서 보이면 다시 판단할 것.)
      */}
      <LinearGradient
        colors={GRADIENT[themeName]}
        locations={[0.12, 0.5, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* 밝기 그라데이션 위에 얹는다 — 둘 다 배경이라 순서로 카드를 가릴 일은 없다 */}
      {/*
        ⚠ 이 그라데이션과 GreenAmbient를 따로 손보지 마라. 겹침이 효과다.

        두 레이어를 하나씩 꺼서 재봤다 (경기운영 배경, 고유색 / 최대 계단):
            둘 다 (지금)        40개 / 177px
            GreenAmbient 끔     18개 / 401px
            ScreenGradient 끔   23개 / 296px
        각자 혼자면 훨씬 심하다. 겹치면 서로의 계단이 어긋나 띠가 좁아진다.

        ── 밴딩을 줄이려고 넷을 시도했고 전부 개선이 없었다 ──────────────

            시도                        결과
            ScreenGradient 구간 압축    177 → 296px   나빠짐
            (locations [0.55,0.8,1])    겹침이 깨져 ScreenGradient가 혼자 남는다

            GreenAmbient r 축소          중앙 31 → 24px  가장자리 37 → 184px
            (70% → 55% → 45%)           중앙은 좋아지고 가장자리가 훨씬 나빠진다
                                        단차 자체는 안 변한다 (0.505 → 0.502)

            노이즈 오버레이(디더)        변화 없음
                                        안드로이드가 이미 화소 단위로 디더링한다
                                        (프레임버퍼에서 29/30 체커보드 확인).
                                        그리고 디더링은 1단계 경계를 흩뜨리는
                                        기법이라 폭 200px 띠에는 안 듣는다.

            SVG 스톱 3개 → 9개           31 → 29px   거의 없음
                                        최종 색 범위가 12단계면 중간색은 12개뿐이다.
                                        스톱은 계단의 위치만 바꾼다.

        남은 지렛대는 둘뿐이다:
          · 알파를 올려 색 단계를 늘린다 — 배경이 밝아지고 초록이 강해진다.
            「배경은 초록이 아니라 밝기다」와 0.22로 헤더를 묻은 이력이 막고 있다.
          · 그라데이션을 화면 전체가 아니라 작은 영역으로 줄인다 — 긴 램프 자체를
            없앤다. 디자인 의도를 바꾸는 일이다.

        ⚠ 재려면 프레임버퍼가 아니라 화면을 봐라. adb screencap은 안드로이드가
          디더링을 끝낸 프레임버퍼를 가져오고, 에뮬레이터 창은 호스트가 따로
          합성해 그린다 — 둘이 다르다. 같은 화면을 창에서 보면 띠가 뚜렷한데
          screencap을 같은 크기로 줄이면 매끄럽다. 실기기는 프레임버퍼가 곧
          화면이라 창 쪽 문제는 안 생긴다. 실기기 확인 전까지는 손대지 마라.
      */}
      {/*
        ══ 배경 밴딩 조사 (2026-08-31) — 여섯을 시도했고 전부 되돌렸다 ══

        ⚠ 이 조사 전체의 전제부터 적는다. **에뮬레이터 창과 프레임버퍼는 다른
          경로다.** adb screencap은 안드로이드가 시스템 디더링을 끝낸 프레임버퍼를
          가져오고(29/30 교대하는 체커보드를 확인했다), 에뮬레이터 창은 호스트
          GPU가 따로 합성해 그린다 — 거기엔 그 디더가 안 걸린다.
          같은 화면을 같은 크기로 줄여 비교하니 캡처는 매끄럽고 창은 띠가 뚜렷했다.

          실기기는 프레임버퍼가 곧 패널이라 디더가 살아 있고, 요즘 폰은 10비트
          패널도 흔하다. **그래서 여기 적힌 「띠가 보인다」는 실기기에서 확인된
          것이 아니다.** 실기기에서 안 보이면 이 조사는 통째로 해당 없음이다.

        시도와 결과 (경기운영 화면, 방사형 프로파일 · 3x3 평활 후):

          ① ScreenGradient 구간 압축      177px → 296px   나빠짐
             locations [0.12,0.5,1] → [0.55,0.8,1]
             두 레이어의 겹침이 깨져 ScreenGradient가 혼자 남는다.

          ② GreenAmbient r 축소            중앙 31→24px / 가장자리 37→184px
             70% → 55% → 45%              단차는 그대로 (0.505 → 0.502)
             중앙만 좋아지고 가장자리가 훨씬 나빠진다. r은 계단을 촘촘하게 할 뿐
             얕게 못 만든다.

          ③ 노이즈 오버레이(디더)          변화 없음
             안드로이드가 이미 화소 단위로 한다. 그리고 디더링은 1단계 경계를
             흩뜨리는 기법이라 폭 200px 띠에는 원리적으로 안 듣는다.

          ④ SVG 스톱 3개 → 9개             31px → 29px   거의 없음
             최종 색 범위가 12단계면 중간색은 12개뿐이다. 스톱은 위치만 바꾼다.

          ⑤ 영역을 상단 38%로 제한         띠가 위쪽에 몰려 더 뚜렷해졌다
             + 중심 cy 42→34%, r 70→78%   상자 끝에 가로 이음매까지 생겼다
             거리를 줄여도 단계가 12개면 같은 수의 띠가 좁은 곳에 모일 뿐이다.
             **원인은 거리가 아니라 단계 수다.**

          ⑥ 알파를 0.15 → 0.34로           띠 95% 87px → 17px   확실히 좁아짐
             (전체 화면 유지)              배경 초록기 3.0 → 22.5   7.5배
             ⚠ 이게 유일하게 효과가 있었지만 못 쓴다. 위 주석의 「모든 배경에
               Green 금지」와 정면으로 부딪힌다 — 배경이 초록이 되면 CTA·활성 탭·
               핵심 숫자의 초록이 바탕에 섞여 안 보인다. 그리고 띠가 없어진 것도
               아니다(17px 간격으로 여전히 있고 촘촘해서 덜 보일 뿐이다).

        전부 되돌렸다. 웹에서 만족했던 원본을 **실기기에 있는지 없는지 모르는
        문제** 때문에 버릴 수 없다는 판단이다.

        실기기(EAS 프로덕션 빌드)에서 띠가 보이면 ⑥이 유일한 후보다. 그때는
        「초록 금지」 규칙을 명시적으로 뒤집는 결정이 먼저 있어야 한다.
      */}
      <GreenAmbient />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {children}
      </SafeAreaView>
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgRoot },

  });
