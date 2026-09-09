// src/features/tour/TourProvider.tsx — 짚을 자리를 모으고 순서대로 띄운다
//
// ── 화면이 하는 일은 한 줄뿐이다 ───────────────────────────────────
//
//     const ref = useTourTarget('tab.settlement');
//     <View ref={ref}> … </View>
//
//   좌표를 재는 것도, 언제 띄울지 정하는 것도 여기가 한다. 화면에 분기를 심으면
//   튜토리얼이 끝나도 그 분기가 남고 아무도 안 걷어낸다.
//
// ── 왜 재는 시점을 늦추나 ──────────────────────────────────────────
// measureInWindow는 그려진 뒤에만 값을 준다. 탭을 옮기고 바로 재면 0이 나온다 —
// 화면 전환 애니메이션이 아직 도는 중이다. 그래서 단계가 바뀌면 한 박자 쉬고 잰다.
// ⚠ 0이 나오면 **띄우지 않고 한 번 더 잰다.** 0,0에 구멍이 뚫리면 왼쪽 위 모서리를
//   짚는 꼴이 되는데, 그건 「엉뚱한 곳을 짚는 튜토리얼」이라 없느니만 못하다.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Coachmark, type SpotRect } from '../../components/Coachmark';
import { useTourStore, type TourRole } from './tourStore';
import { stepsFor, type TourTarget } from './steps';

type Registry = Partial<Record<TourTarget, View | null>>;

interface Ctx {
  register: (name: TourTarget, node: View | null) => void;
  /** 이 역할의 코스를 처음부터 시작한다 */
  start: (role: TourRole) => void;
}

const TourCtx = createContext<Ctx>({ register: () => {}, start: () => {} });

/** 화면이 쓰는 것 — 이 ref를 짚을 요소에 달면 끝이다 */
export function useTourTarget(name: TourTarget) {
  const { register } = useContext(TourCtx);
  return useCallback((node: View | null) => register(name, node), [name, register]);
}

export function useTour() {
  return useContext(TourCtx);
}

/** 좌표가 0이면 아직 안 그려진 것이다 — 그 값으로 구멍을 뚫으면 안 된다 */
const usable = (r: SpotRect | null): r is SpotRect => !!r && r.width > 0 && r.height > 0;

export function TourProvider({
  children,
  role,
  onNavigate,
}: {
  children: ReactNode;
  /** 지금 사람의 역할. 팀이 없으면 null — 그때는 튜토리얼이 안 돈다 */
  role: TourRole | null;
  /** 단계가 다른 탭을 요구할 때 부른다 */
  onNavigate: (screen: 'Home' | 'Attendance' | 'Settlement') => void;
}) {
  const nodes = useRef<Registry>({});
  const [running, setRunning] = useState<TourRole | null>(null);
  const [index, setIndex] = useState(0);
  const [spot, setSpot] = useState<SpotRect | null>(null);
  const [ready, setReady] = useState(false);

  const loaded = useTourStore((s) => s.loaded);
  const done = useTourStore((s) => s.done);
  const load = useTourStore((s) => s.load);
  const finish = useTourStore((s) => s.finish);

  useEffect(() => {
    load();
  }, []);

  const register = useCallback((name: TourTarget, node: View | null) => {
    nodes.current[name] = node;
  }, []);

  const start = useCallback((r: TourRole) => {
    setRunning(r);
    setIndex(0);
  }, []);

  /* 팀이 생기고 아직 안 본 코스가 있으면 저절로 시작한다 */
  useEffect(() => {
    if (!loaded || !role || running) return;
    if (!done[role]) start(role);
  }, [loaded, role, done, running, start]);

  const steps = running ? stepsFor(running) : [];
  const step = steps[index];

  /* 이 단계가 다른 탭을 요구하면 먼저 옮긴다 */
  useEffect(() => {
    if (!step?.screen) return;
    onNavigate(step.screen);
  }, [step?.screen, index, running]);

  /*
    좌표를 잰다. 화면 전환이 끝나야 값이 나오므로 조금 기다렸다 재고,
    0이면 몇 번 더 시도한다. 끝내 못 재면 **구멍 없이** 말풍선만 띄운다 —
    설명은 남고 엉뚱한 자리를 짚지는 않는다.
  */
  useEffect(() => {
    if (!step) return;
    setReady(false);
    setSpot(null);
    if (!step.target) {
      setReady(true);
      return;
    }
    let tries = 0;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const node = nodes.current[step.target!];
      if (!node) return retry();
      node.measureInWindow((x, y, width, height) => {
        if (!alive) return;
        const r = { x, y, width, height };
        if (usable(r)) {
          setSpot(r);
          setReady(true);
        } else retry();
      });
    };
    const retry = () => {
      tries += 1;
      if (tries > 12) {
        /* 못 쟀다 — 구멍 없이 설명만. 「짚는 척」보다 낫다 */
        setReady(true);
        return;
      }
      setTimeout(tick, 120);
    };
    const first = setTimeout(tick, 260);
    return () => {
      alive = false;
      clearTimeout(first);
    };
  }, [step, index, running]);

  const close = useCallback(() => {
    if (running) finish(running);
    setRunning(null);
    setIndex(0);
    setSpot(null);
  }, [running, finish]);

  const next = useCallback(() => {
    if (index + 1 >= steps.length) close();
    else setIndex((i) => i + 1);
  }, [index, steps.length, close]);

  return (
    <TourCtx.Provider value={{ register, start }}>
      {children}
      {!!step && ready && (
        <Coachmark
          visible
          spot={spot}
          title={step.title}
          body={step.body}
          step={index + 1}
          total={steps.length}
          isLast={index + 1 === steps.length}
          onNext={next}
          onSkip={close}
        />
      )}
    </TourCtx.Provider>
  );
}
