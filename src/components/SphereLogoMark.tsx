import { useMemo } from 'react';
import Svg, { Circle, Defs, Line, RadialGradient, Stop } from 'react-native-svg';

interface SphereLogoMarkProps {
  size?: number;
  color?: string;
}

interface Point3D {
  x: number;
  y: number;
  z: number;
}

const TILT = 0.35;

function buildSpherePoints(count: number): Point3D[] {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - (i / (count - 1)) * 2;
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    return { x: Math.cos(theta) * radiusAtY, y, z: Math.sin(theta) * radiusAtY };
  });
}

function distance(a: Point3D, b: Point3D): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

function buildNetwork(pointCount: number, maxEdges: number, edgeMaxDist: number) {
  const raw = buildSpherePoints(pointCount);
  const cosT = Math.cos(TILT);
  const sinT = Math.sin(TILT);
  const points = raw.map((p) => ({
    x: p.x,
    y: p.y * cosT - p.z * sinT,
    z: p.y * sinT + p.z * cosT,
  }));

  const candidates: { a: Point3D; b: Point3D; d: number }[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = distance(points[i], points[j]);
      if (d < edgeMaxDist) candidates.push({ a: points[i], b: points[j], d });
    }
  }
  candidates.sort((e1, e2) => e1.d - e2.d);

  return { points, edges: candidates.slice(0, maxEdges) };
}

function buildAmbient(count: number) {
  return Array.from({ length: count }, () => ({
    x: (Math.random() - 0.5) * 2.1,
    y: (Math.random() - 0.5) * 2.1,
    r: Math.random() * 1.1 + 0.4,
    o: Math.random() * 0.3 + 0.08,
  }));
}

export function SphereLogoMark({ size = 48, color = '#4ADE80' }: SphereLogoMarkProps) {
  const detailed = size >= 100;
  const pointCount = detailed ? 90 : 42;
  const maxEdges = detailed ? 70 : 26;
  const edgeMaxDist = detailed ? 0.5 : 0.6;
  const ambientCount = detailed ? 36 : 0;

  const { points, edges } = useMemo(
    () => buildNetwork(pointCount, maxEdges, edgeMaxDist),
    [pointCount, maxEdges, edgeMaxDist]
  );
  const ambient = useMemo(() => buildAmbient(ambientCount), [ambientCount]);

  const radius = size / 2;
  const sphereScale = radius * 0.86;

  const project = (p: Point3D) => ({
    x: radius + p.x * sphereScale,
    y: radius + p.y * sphereScale,
    depth: (p.z + 1) / 2,
  });

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <RadialGradient id="sphereHalo" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={color} stopOpacity={0.32} />
          <Stop offset="65%" stopColor={color} stopOpacity={0.1} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>

      <Circle cx={radius} cy={radius} r={radius} fill="url(#sphereHalo)" />

      {ambient.map((a, i) => (
        <Circle
          key={`amb${i}`}
          cx={radius + a.x * radius}
          cy={radius + a.y * radius}
          r={a.r}
          fill={color}
          opacity={a.o}
        />
      ))}

      {edges.map((e, i) => {
        const pa = project(e.a);
        const pb = project(e.b);
        return (
          <Line
            key={`e${i}`}
            x1={pa.x}
            y1={pa.y}
            x2={pb.x}
            y2={pb.y}
            stroke={color}
            strokeWidth={0.6}
            opacity={0.12 + Math.min(pa.depth, pb.depth) * 0.4}
          />
        );
      })}

      {points.flatMap((p, i) => {
        const pr = project(p);
        const core = 0.8 + pr.depth * 1.6;
        return [
          <Circle
            key={`pg${i}`}
            cx={pr.x}
            cy={pr.y}
            r={core * 2.4}
            fill={color}
            opacity={0.08 + pr.depth * 0.12}
          />,
          <Circle key={`pc${i}`} cx={pr.x} cy={pr.y} r={core} fill={color} opacity={0.4 + pr.depth * 0.6} />,
        ];
      })}
    </Svg>
  );
}
