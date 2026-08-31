// src/lib/useThemed.ts — 화면이 테마를 읽는 유일한 통로
//
// ── 왜 훅이어야 하는가 ──────────────────────────────────────────────
// StyleSheet.create는 **모듈 최상단에서 한 번 평가되고 굳는다.**
// `{ backgroundColor: colors.card }`는 그 순간의 문자열을 복사해 넣는 것이라,
// 나중에 colors를 바꿔도 이미 만들어진 스타일은 안 따라온다.
// 앱을 다시 그려도 소용없다 — 모듈은 다시 평가되지 않는다.
//
// 그래서 테마가 바뀌면 **스타일 객체를 다시 만들어야** 하고, 그러려면 만드는
// 시점이 컴포넌트 안이어야 한다. 이 훅이 그 자리다.
//
// ── 옮기는 모양 ─────────────────────────────────────────────────────
// 이 훅이 `colors`라는 **같은 이름**으로 팔레트를 돌려주는 것이 요점이다.
// 화면 본문의 `colors.green`·`styles.card`가 한 글자도 안 바뀐다:
//
//   전
//     import { colors, radius } from '../theme';
//     const styles = StyleSheet.create({ card: { backgroundColor: colors.card } });
//     export function Foo() { return <Icon color={colors.green} style={styles.card} />; }
//
//   후
//     import { radius, type Palette } from '../theme';
//     import { useThemed } from '../lib/useThemed';
//     const makeStyles = (colors: Palette) =>
//       StyleSheet.create({ card: { backgroundColor: colors.card } });
//     export function Foo() {
//       const { colors, styles } = useThemed(makeStyles);
//       return <Icon color={colors.green} style={styles.card} />;
//     }
//
// 바뀌는 것은 감싸는 세 줄뿐이다. 그래서 64개 파일을 손이 아니라 스크립트로 옮겼다.
//
// ⚠ 컴포넌트가 여러 개인 파일은 **각 컴포넌트가 따로 불러야 한다.** 하나에만
//   넣으면 나머지는 여전히 굳은 스타일을 쓰는데, 다크에서는 값이 같아서
//   **아무 증상이 없다.** 라이트로 바꿔야 그 컴포넌트만 어둡게 남는다.
import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { palettes, type Palette, type ThemeName } from '../theme';
import { useThemeStore } from './themeStore';

/** 지금 실제로 그릴 테마. 'system'이면 기기 설정을 읽는다. */
export function useThemeName(): ThemeName {
  const choice = useThemeStore((s) => s.choice);
  /*
    ⚠ 훅은 조건 없이 부른다. `choice === 'system'`일 때만 부르고 싶어지지만
      그러면 훅 순서가 바뀐다.
    ⚠ useColorScheme은 null을 줄 수 있다(아직 모름). 그때는 다크로 둔다 —
      이 앱이 원래 다크 전용이었고, 모를 때 밝게 켜면 어두운 데서 눈이 부시다.
  */
  const system = useColorScheme();
  if (choice === 'system') return system === 'light' ? 'light' : 'dark';
  return choice;
}

/** 팔레트만 필요할 때 (스타일이 없는 컴포넌트) */
export function useColors(): Palette {
  return palettes[useThemeName()];
}

/**
 * 팔레트와, 그 팔레트로 만든 스타일을 함께 돌려준다.
 *
 * makeStyles는 **모듈 최상단에 두어야 한다.** 컴포넌트 안에서 만들면 매 렌더마다
 * 새 함수가 되어 아래 useMemo가 매번 다시 계산한다 — 캐시가 없는 것과 같다.
 */
export function useThemed<T>(makeStyles: (colors: Palette) => T): { colors: Palette; styles: T } {
  const name = useThemeName();
  const colors = palettes[name];
  // 테마가 그대로면 스타일도 그대로다. 렌더마다 StyleSheet.create를 다시 부르지 않는다
  const styles = useMemo(() => makeStyles(colors), [name, makeStyles]);
  return { colors, styles };
}
