import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 기기에만 남는 값이라 이름을 바꿔도 잃는 건 "튜토리얼을 봤다"는 표시 하나뿐이다.
// 출시 전이라 지금 정리한다 — 나가고 나면 바꾸는 순간 모든 사용자가 튜토리얼을 다시 본다.
const ONBOARDING_SEEN_KEY = 'kickday:onboarding_seen';

interface OnboardingState {
  loaded: boolean;
  seen: boolean;
  checkSeen: () => Promise<void>;
  markSeen: () => Promise<void>;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  loaded: false,
  seen: false,
  checkSeen: async () => {
    const value = await AsyncStorage.getItem(ONBOARDING_SEEN_KEY);
    set({ seen: value === 'true', loaded: true });
  },
  markSeen: async () => {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
    set({ seen: true });
  },
}));
