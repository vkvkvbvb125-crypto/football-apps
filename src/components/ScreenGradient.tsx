import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

export function ScreenGradient({ children }: PropsWithChildren) {
  return <View style={styles.background}>{children}</View>;
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: '#0F1512',
  },
});
