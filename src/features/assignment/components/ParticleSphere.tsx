import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

const PARTICLE_COUNT = 150;
const DEFAULT_SPHERE_RADIUS = 130;
const ROTATION_STEPS = 36;
const ROTATION_DURATION_MS = 26000;
const DOT_BASE_SIZE = 4;

interface ParticleSphereProps {
  size?: number;
}

interface ParticleFrames {
  key: number;
  y: number;
  size: number;
  xSteps: number[];
  opacitySteps: number[];
  scaleSteps: number[];
}

function lerp(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  const t = (value - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}

// 구 표면에 점을 고르게 분포시키는 피보나치 스피어 알고리즘.
function buildParticles(radius: number, dotBaseSize: number): ParticleFrames[] {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const y0 = 1 - (i / (PARTICLE_COUNT - 1)) * 2;
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y0 * y0));
    const theta0 = goldenAngle * i;
    const x0 = Math.cos(theta0) * radiusAtY;
    const z0 = Math.sin(theta0) * radiusAtY;
    const size = dotBaseSize * lerp(radiusAtY, 0, 1, 0.7, 1);

    const xSteps: number[] = [];
    const opacitySteps: number[] = [];
    const scaleSteps: number[] = [];

    for (let step = 0; step <= ROTATION_STEPS; step++) {
      const angle = (step / ROTATION_STEPS) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      // Y축 기준 회전: x' = x*cos + z*sin, z' = -x*sin + z*cos (y는 불변)
      const x = x0 * cos + z0 * sin;
      const z = -x0 * sin + z0 * cos;

      xSteps.push(x * radius - size / 2);
      opacitySteps.push(lerp(z, -1, 1, 0.12, 0.85));
      scaleSteps.push(lerp(z, -1, 1, 0.5, 1.15));
    }

    return { key: i, y: y0 * radius - size / 2, size, xSteps, opacitySteps, scaleSteps };
  });
}

export function ParticleSphere({ size }: ParticleSphereProps) {
  const radius = size ? size * 0.42 : DEFAULT_SPHERE_RADIUS;
  const dotBaseSize = size ? (DOT_BASE_SIZE * size) / 300 : DOT_BASE_SIZE;
  const particles = useMemo(() => buildParticles(radius, dotBaseSize), [radius, dotBaseSize]);
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    function run() {
      if (cancelled) return;
      rotation.setValue(0);
      Animated.timing(rotation, {
        toValue: 1,
        duration: ROTATION_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) run();
      });
    }
    run();
    return () => {
      cancelled = true;
      rotation.stopAnimation();
    };
  }, [rotation]);

  const inputRange = useMemo(
    () => Array.from({ length: ROTATION_STEPS + 1 }, (_, i) => i / ROTATION_STEPS),
    []
  );

  return (
    <View style={size ? { width: size, height: size } : styles.container} pointerEvents="none">
      <View style={styles.center}>
        {particles.map((p) => (
          <Animated.View
            key={p.key}
            style={[
              styles.dot,
              {
                width: p.size,
                height: p.size,
                borderRadius: p.size / 2,
                top: p.y,
                opacity: rotation.interpolate({ inputRange, outputRange: p.opacitySteps }),
                transform: [
                  { translateX: rotation.interpolate({ inputRange, outputRange: p.xSteps }) },
                  { scale: rotation.interpolate({ inputRange, outputRange: p.scaleSteps }) },
                ],
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0F1512',
    overflow: 'hidden',
  },
  center: {
    position: 'absolute',
    top: '50%',
    left: '50%',
  },
  dot: {
    position: 'absolute',
    backgroundColor: '#4ADE80',
  },
});
