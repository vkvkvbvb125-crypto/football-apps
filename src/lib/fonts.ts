// src/lib/fonts.ts — Pretendard 로딩 + 굵기 매핑
//
// RN은 iOS/Android에서 fontWeight + 커스텀 폰트 조합이 제대로 안 먹는 경우가 많아,
// 굵기별 폰트 파일을 각각 등록하고 fontWeight → fontFamily로 매핑해준다.
// 실제 전역 적용은 ../components/nativeText.tsx의 Text/TextInput 래퍼가 담당한다.
import { useFonts } from 'expo-font';

export const PRETENDARD = {
  '400': 'Pretendard-Regular',
  '500': 'Pretendard-Medium',
  '600': 'Pretendard-SemiBold',
  '700': 'Pretendard-Bold',
  '800': 'Pretendard-ExtraBold',
} as const;

export function useAppFonts() {
  const [loaded, error] = useFonts({
    'Pretendard-Regular': require('../../assets/fonts/Pretendard-Regular.otf'),
    'Pretendard-Medium': require('../../assets/fonts/Pretendard-Medium.otf'),
    'Pretendard-SemiBold': require('../../assets/fonts/Pretendard-SemiBold.otf'),
    'Pretendard-Bold': require('../../assets/fonts/Pretendard-Bold.otf'),
    'Pretendard-ExtraBold': require('../../assets/fonts/Pretendard-ExtraBold.otf'),
  });
  return loaded || !!error; // 폰트 실패해도 앱은 시스템 폰트로 계속 뜨게 한다
}

type AnyStyle = Record<string, unknown> | AnyStyle[] | null | undefined | false | string | number;

function flattenWeight(style: AnyStyle): string | undefined {
  if (!style || typeof style !== 'object') return undefined;
  if (Array.isArray(style)) {
    for (let i = style.length - 1; i >= 0; i--) {
      const w = flattenWeight(style[i]);
      if (w) return w;
    }
    return undefined;
  }
  const w = (style as { fontWeight?: string | number }).fontWeight;
  if (w == null) return undefined;
  const key = String(w) === 'bold' ? '700' : String(w) === 'normal' ? '400' : String(w);
  return key;
}

/** style에 적힌 fontWeight에 맞는 Pretendard fontFamily 이름을 돌려준다. */
export function fontFamilyForStyle(style: unknown): string {
  const weight = flattenWeight(style as AnyStyle) ?? '400';
  return PRETENDARD[weight as keyof typeof PRETENDARD] ?? PRETENDARD['400'];
}
