import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_SEEN_KEY = 'futsalclub:onboarding_seen';

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
