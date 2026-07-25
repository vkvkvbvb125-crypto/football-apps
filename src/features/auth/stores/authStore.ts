import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../../lib/supabase';
import { signInWithKakao, signOut as signOutService } from '../services/authService';

interface AuthState {
  session: Session | null;
  initialized: boolean;
  signingIn: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => {
  supabase.auth.getSession()
    .then(({ data }) => {
      set({ session: data.session, initialized: true });
    })
    .catch(() => {
      set({ initialized: true });
    });

  supabase.auth.onAuthStateChange((_event, session) => {
    set({ session, initialized: true });
  });

  return {
    session: null,
    initialized: false,
    signingIn: false,
    error: null,
    signIn: async () => {
      set({ signingIn: true, error: null });
      try {
        await signInWithKakao();
      } catch (err) {
        set({ error: err instanceof Error ? err.message : '로그인에 실패했습니다.' });
      } finally {
        set({ signingIn: false });
      }
    },
    signOut: async () => {
      await signOutService();
    },
  };
});
