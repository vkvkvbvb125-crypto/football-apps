// src/lib/themeStore.ts — 화면 모드(밝게 / 어둡게 / 기기 설정 따르기)
//
// 저장 방식은 onboardingStore와 같다 — AsyncStorage에 한 줄.
// 서버에 두지 않는다. 기기마다 다를 수 있는 값이고(폰은 다크, 태블릿은 라이트),
// 로그인 전에도 정해져 있어야 해서 계정에 매달 이유가 없다.
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ThemeName } from '../theme';

/** 사용자가 고른 것. 'system'은 「기기 설정을 따른다」 */
export type ThemeChoice = ThemeName | 'system';

const THEME_KEY = 'kickday:theme';

interface ThemeState {
  /** 읽기 전에는 false. 이 값이 false인 동안 화면을 그리면 잘못된 테마가 한 번 번쩍인다 */
  loaded: boolean;
  choice: ThemeChoice;
  load: () => Promise<void>;
  setChoice: (choice: ThemeChoice) => Promise<void>;
}

/** 저장된 문자열이 셋 중 하나인지 본다 — 손상됐거나 옛 값이면 system으로 돌아간다 */
export function toChoice(value: string | null): ThemeChoice {
  return value === 'dark' || value === 'light' || value === 'system' ? value : 'system';
}

export const useThemeStore = create<ThemeState>((set) => ({
  loaded: false,
  /*
    기본값이 'system'인 이유. 예전에는 다크 고정이었고 app.json의
    userInterfaceStyle도 'dark'였다. 그걸 그대로 기본값으로 두면 「기기를 라이트로
    쓰는 사람」이 설정에 들어와서 바꿔야만 라이트를 본다 — 고른 적 없는 사람에게
    우리 취향을 강요하는 셈이다. 기기 설정이 이미 그 사람의 답이다.
  */
  choice: 'system',
  load: async () => {
    try {
      set({ choice: toChoice(await AsyncStorage.getItem(THEME_KEY)), loaded: true });
    } catch {
      // 저장소를 못 읽어도 앱은 떠야 한다 — system으로 그린다
      set({ loaded: true });
    }
  },
  setChoice: async (choice) => {
    // 화면부터 바꾸고 저장한다. 저장이 느려도 누른 즉시 바뀌어야 한다
    set({ choice });
    try {
      await AsyncStorage.setItem(THEME_KEY, choice);
    } catch {
      /* 저장 실패는 삼킨다 — 이번 실행에는 적용됐고, 다음에 다시 고르면 된다 */
    }
  },
}));
