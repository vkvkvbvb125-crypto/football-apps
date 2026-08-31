// src/features/notifications/stores/pendingNotificationStore.ts
// 알림을 눌러서 들어온 「갈 곳」을 잠깐 들고 있는 곳.
//
// pendingSettlementStore·pendingInviteStore와 **같은 이유로 같은 방식**이다.
// 그쪽 주석을 그대로 옮기면:
//
//   「링크는 로그인·팀 로드보다 먼저 도착할 수 있다(앱이 꺼진 상태에서 링크를 누른
//    경우). 그래서 바로 화면을 여는 대신 여기 담아두고, 준비가 된 쪽이 꺼내 쓴다.」
//
// 알림도 똑같다. 앱이 죽어 있을 때 알림을 누르면 응답이 세션 복원보다 먼저 온다.
// 그때 바로 navigate하면 아직 없는 네비게이터에 대고 부르는 셈이 된다.
//
// ⚠ 이것이 「로그인 안 된 상태에서 탭하면?」의 답이기도 하다. 홈으로 보내거나
//   버리지 않는다 — 담아두면 로그인·팀 로드가 끝나는 순간 MainTabNavigator가
//   꺼내서 그 화면을 연다. 사용자는 로그인만 하면 원래 가려던 곳에 도착한다.
import { create } from 'zustand';
import type { RouteIntent } from '../notificationRoute';

interface PendingNotificationState {
  intent: RouteIntent | null;
  setIntent: (intent: RouteIntent) => void;
  clear: () => void;
}

export const usePendingNotificationStore = create<PendingNotificationState>((set) => ({
  intent: null,
  setIntent: (intent) => set({ intent }),
  clear: () => set({ intent: null }),
}));
