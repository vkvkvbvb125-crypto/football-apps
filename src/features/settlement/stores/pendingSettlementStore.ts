// src/features/settlement/stores/pendingSettlementStore.ts
// 딥링크로 들어온 정산 id를 잠깐 들고 있는 곳.
//
// 링크는 로그인·팀 로드보다 먼저 도착할 수 있다(앱이 꺼진 상태에서 링크를 누른 경우).
// 그래서 바로 화면을 여는 대신 여기 담아두고, 준비가 된 쪽(MainTabNavigator)이 꺼내 쓴다.
// 초대 링크(pendingInviteStore)가 같은 이유로 같은 방식을 쓴다.
import { create } from 'zustand';

interface PendingSettlementState {
  id: string | null;
  setId: (id: string) => void;
  clear: () => void;
}

export const usePendingSettlementStore = create<PendingSettlementState>((set) => ({
  id: null,
  setId: (id) => set({ id }),
  clear: () => set({ id: null }),
}));
