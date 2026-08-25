// src/lib/useReduceMotion.ts
// OS의 「동작 줄이기」 설정 하나를 읽는다. HomeBanner 안에 인라인으로 있던 블록을 그대로 옮겼다 —
// 두 번째로 쓰는 자리가 생겼고, 복사하면 구독/해제가 두 곳으로 갈린다.
//
// 자리를 src/lib에 둔 이유: 기능에 매인 훅은 features/<f>/hooks/에 있고
// (useSettlementRealtime), 앱 전체가 쓰는 훅은 lib에 있다(useAppFonts).
// 이건 홈과 일정이 같이 쓰므로 후자다.
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);

  // OS의 「동작 줄이기」. 켜져 있으면 스스로 움직이는 것을 하지 않는다 — 그게 어지럼을
  // 만드는 사람들이 있고, 그 설정이 바로 그 말이다. 도중에 바뀔 수도 있어 구독한다.
  //
  // 무엇을 생략할지는 쓰는 쪽이 정한다. 배너는 자동 전환을 아예 걸지 않고, 명단 시트는
  // 저장 후 체크가 커지는 동작만 건너뛰고 체크 자체는 띄운다 — 시간까지 없애면
  // 눌렀는데 아무것도 안 보이고 닫힌다.
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setReduceMotion(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return reduceMotion;
}
