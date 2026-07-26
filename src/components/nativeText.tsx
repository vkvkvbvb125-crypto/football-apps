// src/components/nativeText.tsx — Pretendard가 실제로 전역 적용되게 하는 지점.
//
// RN 0.86의 Text/TextInput은 함수형 컴포넌트라 render 패치나 exports 재할당으로는
// 폰트를 가로챌 수 없다(둘 다 시도해봤고 조용히 no-op이었음). 그래서 대신 Text/TextInput을
// 이 래퍼로 감싸고, 코드베이스 전체의 import를 이 파일로 돌린다.
// 사용하는 쪽 JSX(<Text>, <TextInput>)는 이름이 같아서 바꿀 게 없다.
import { Text as RNText, TextInput as RNTextInput } from 'react-native';
import type { TextProps, TextInputProps } from 'react-native';
import { fontFamilyForStyle } from '../lib/fonts';

export function Text({ style, ...rest }: TextProps) {
  return <RNText {...rest} style={[{ fontFamily: fontFamilyForStyle(style) }, style]} />;
}

interface TextInputPropsWithRef extends TextInputProps {
  ref?: React.Ref<RNTextInput>;
}

export function TextInput({ style, ref, ...rest }: TextInputPropsWithRef) {
  return <RNTextInput ref={ref} {...rest} style={[{ fontFamily: fontFamilyForStyle(style) }, style]} />;
}
