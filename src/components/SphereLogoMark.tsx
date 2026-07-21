import { useMemo } from 'react';
import Svg, { Circle, Line } from 'react-native-svg';

interface SphereLogoMarkProps {
  size?: number;
  color?: string;
}

interface Point3D {
  x: number;
  y: number;
  z: number;
}

const POINT_COUNT = 30;
const NEIGHBOR_COUNT = 3;
const TILT = 0.4;

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

function buildNetwork() {
  const raw = buildSpherePoints(POINT_COUNT);
  const cosT = Math.cos(TILT);
  const sinT = Math.sin(TILT);
  const rotated = raw.map((p) => ({
    x: p.x,
    y: p.y * cosT - p.z * sinT,
    z: p.y * sinT + p.z * cosT,
  }));
  const points = rotated.filter((p) => p.z > -0.35);

  const edgeSet = new Set<string>();
  const edges: { a: Point3D; b: Point3D }[] = [];
  points.forEach((p, i) => {
    const nearest = points
      .map((q, j) => ({ j, d: distance(p, q) }))
      .filter((e) => e.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, NEIGHBOR_COUNT);
    nearest.forEach(({ j }) => {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push({ a: p, b: points[j] });
      }
    });
  });

  return { points, edges };
}

export function SphereLogoMark({ size = 48, color = '#4ADE80' }: SphereLogoMarkProps) {
  const { points, edges } = useMemo(() => buildNetwork(), []);
  const radius = size / 2;

  const project = (p: Point3D) => ({
    x: radius + p.x * radius * 0.88,
    y: radius + p.y * radius * 0.88,
    depth: (p.z + 1) / 2,
  });

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
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
            strokeWidth={1}
            opacity={0.15 + Math.min(pa.depth, pb.depth) * 0.35}
          />
        );
      })}
      {points.map((p, i) => {
        const pr = project(p);
        return (
          <Circle
            key={`p${i}`}
            cx={pr.x}
            cy={pr.y}
            r={1.2 + pr.depth * 1.8}
            fill={color}
            opacity={0.35 + pr.depth * 0.65}
          />
        );
      })}
    </Svg>
  );
}
