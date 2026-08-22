import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../../lib/supabase';
import {
  signInWithKakao,
  signInWithNaver,
  signInWithOAuth,
  signInWithPassword,
  signUpWithPassword,
  resetPassword,
  completeRecovery,
  updatePassword as updatePasswordService,
  signOut as signOutService,
  type OAuthProvider,
} from '../services/authService';

/** 로그인 수단 — 버튼 하나가 어떤 흐름을 타는지 이 이름으로 갈린다 */
export type SocialProvider = 'kakao' | 'naver' | OAuthProvider;

interface AuthState {
  session: Session | null;
  initialized: boolean;
  signingIn: boolean;
  error: string | null;
  /** 회원가입 후 "메일함을 확인하세요" 안내를 띄울지 */
  needsEmailConfirm: boolean;

  /**
   * 비밀번호 재설정 링크로 들어온 상태.
   *
   * 링크를 처리하면 세션이 서므로 평소 규칙대로면 바로 홈으로 가버린다. 그러면 정작
   * 비밀번호를 바꿀 기회가 없다 — 이 깃발이 서 있는 동안은 재설정 화면을 붙잡아 둔다.
   */
  recoveryMode: boolean;
  startRecovery: (url: string) => Promise<void>;
  /** 메일 링크가 오류를 달고 돌아왔을 때 (만료·재사용 등) 이유를 화면에 남긴다 */
  reportLinkError: (code: string | null, description: string | null) => void;
  updatePassword: (newPassword: string) => Promise<void>;

  signInWithSocial: (provider: SocialProvider) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  clearError: () => void;
  signOut: () => Promise<void>;
}

/**
 * 아이디·비밀번호가 맞지 않을 때의 문구.
 *
 * 로그인 화면이 이 오류에만 "간편 로그인으로 가입하셨나요?"를 띄우려고 값을 비교한다 —
 * 링크 만료 같은 다른 오류에까지 붙으면 엉뚱한 곳을 짚어주는 안내가 된다.
 */
export const CREDENTIAL_MISMATCH = '이메일 또는 비밀번호가 맞지 않아요';

/** Supabase 오류 원문은 영어라 자주 보는 것만 우리말로 바꿔준다 */
function readableError(err: unknown) {
  const raw = err instanceof Error ? err.message : '';
  // 소셜 가입 안내는 여기 붙이지 않는다 — 빨간 두 줄이 되어 무겁다.
  // 대신 로그인 화면이 소셜 버튼 위 구분선에서 안내한다(답이 있는 자리에서 말해준다).
  if (/Invalid login credentials/i.test(raw)) return CREDENTIAL_MISMATCH;
  if (/User already registered/i.test(raw)) return '이미 가입된 이메일이에요';
  if (/Password should be at least/i.test(raw)) return '비밀번호는 6자 이상이어야 해요';
  if (/different from the old password/i.test(raw)) return '지금 쓰던 비밀번호와 다르게 정해주세요';
  if (/Email not confirmed/i.test(raw)) return '메일함에서 인증을 먼저 완료해주세요';
  if (/provider is not enabled/i.test(raw)) return '아직 준비되지 않은 로그인 방식이에요';
  // 짧은 시간에 메일을 여러 번 요청했을 때 — 원문은 "after 46 seconds"처럼 초를 알려준다
  if (/only request this after/i.test(raw)) {
    const sec = raw.match(/after (\d+) seconds?/i)?.[1];
    return sec ? `${sec}초 후에 다시 시도해주세요` : '잠시 후에 다시 시도해주세요';
  }
  // 만료됐거나 이미 쓴 재설정 링크를 눌렀을 때 — 원문("Invalid JWT structure" 등)은 알아볼 수 없다
  if (/JWT|token.*(expired|invalid)|invalid.*token/i.test(raw)) {
    return '링크가 만료되었거나 이미 사용되었어요. 비밀번호 찾기를 다시 시도해주세요';
  }
  /*
   * 여기까지 왔으면 우리가 모르는 오류다.
   *
   * raw를 그대로 돌려주고 있었다 — Supabase 원문은 영어라서 화면에 그대로 뜬다
   * ("AuthApiError: Database error saving new user" 같은 문장을 사용자가 본다).
   * 원문은 콘솔에 남기고 화면에는 무엇을 해야 하는지만 말한다.
   */
  if (raw) console.error('[auth]', raw);
  return '로그인에 실패했어요. 잠시 후 다시 시도해주세요';
}

export const useAuthStore = create<AuthState>((set) => {
  supabase.auth
    .getSession()
    .then(({ data }) => {
      set({ session: data.session, initialized: true });
    })
    .catch(() => {
      set({ initialized: true });
    });

  supabase.auth.onAuthStateChange((_event, session) => {
    set({ session, initialized: true });
  });

  /** 모든 로그인 흐름이 같은 로딩·오류 처리를 쓰도록 한 곳에 모은다 */
  const run = async (fn: () => Promise<unknown>) => {
    set({ signingIn: true, error: null });
    try {
      await fn();
    } catch (err) {
      set({ error: readableError(err) });
    } finally {
      set({ signingIn: false });
    }
  };

  return {
    session: null,
    initialized: false,
    signingIn: false,
    error: null,
    needsEmailConfirm: false,
    recoveryMode: false,

    startRecovery: (url) =>
      run(async () => {
        const ok = await completeRecovery(url);
        if (ok) set({ recoveryMode: true });
      }),

    reportLinkError: (code, description) => {
      // 링크가 만료되면 Supabase는 type=recovery 없이 오류만 달고 돌려보낸다.
      // 이걸 흘려보내면 사용자는 아무 설명 없는 로그인 화면만 보고 왜 안 되는지 알 수 없다.
      const expired = code === 'otp_expired' || /expired/i.test(description ?? '');
      set({
        error: expired
          ? '링크가 만료되었어요. 비밀번호 찾기를 다시 시도해주세요'
          : '링크가 유효하지 않아요. 비밀번호 찾기를 다시 시도해주세요',
      });
    },

    updatePassword: (newPassword) =>
      run(async () => {
        await updatePasswordService(newPassword);
        // 다 바꿨으면 붙잡아 두던 걸 놓는다 — 이미 세션이 있으니 곧바로 앱으로 들어간다
        set({ recoveryMode: false });
      }),

    signInWithSocial: (provider) =>
      run(() => {
        if (provider === 'kakao') return signInWithKakao();
        if (provider === 'naver') return signInWithNaver();
        return signInWithOAuth(provider);
      }),

    signInWithEmail: (email, password) => run(() => signInWithPassword(email, password)),

    signUpWithEmail: (email, password, displayName) =>
      run(async () => {
        const { needsEmailConfirm } = await signUpWithPassword(email, password, displayName);
        set({ needsEmailConfirm });
      }),

    sendPasswordReset: (email) => run(() => resetPassword(email)),

    clearError: () => set({ error: null, needsEmailConfirm: false }),

    signOut: async () => {
      await signOutService();
    },
  };
});
