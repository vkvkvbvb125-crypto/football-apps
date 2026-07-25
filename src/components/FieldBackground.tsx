import { StyleSheet, View, type ViewStyle } from 'react-native';

const STRIPE_COUNT = 7;

interface FieldBackgroundProps {
  style?: ViewStyle;
  variant?: 'bright' | 'night';
}

export function FieldBackground({ style, variant = 'bright' }: FieldBackgroundProps) {
  const isNight = variant === 'night';
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        styles.container,
        isNight ? styles.containerNight : styles.containerBright,
        style,
        styles.noPointerEvents,
      ]}
    >
      {Array.from({ length: STRIPE_COUNT }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.stripe,
            i % 2 === 0
              ? isNight
                ? styles.stripeLightNight
                : styles.stripeLight
              : isNight
                ? styles.stripeDarkNight
                : styles.stripeDark,
          ]}
        />
      ))}
      <View style={[styles.centerCircle, isNight && styles.lineNight]} />
      <View style={[styles.centerLine, isNight && styles.lineNight]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    overflow: 'hidden',
  },
  containerBright: {
    backgroundColor: '#25B859',
  },
  containerNight: {
    backgroundColor: '#1B4530',
  },
  noPointerEvents: {
    pointerEvents: 'none',
  },
  stripe: {
    flex: 1,
    height: '100%',
  },
  stripeLight: {
    backgroundColor: '#2ECC66',
  },
  stripeDark: {
    backgroundColor: '#25B859',
  },
  stripeLightNight: {
    backgroundColor: '#245C3F',
  },
  stripeDarkNight: {
    backgroundColor: '#1B4530',
  },
  centerLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  centerCircle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 90,
    height: 90,
    borderRadius: 45,
    marginTop: -45,
    marginLeft: -45,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  lineNight: {
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
});
