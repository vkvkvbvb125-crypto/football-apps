import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { login as kakaoNativeLogin } from '@react-native-seoul/kakao-login';
import { supabase } from '../../../lib/supabase';

// 웹에서 팝업으로 열린 카카오 인증 창이 리다이렉트 완료를 opener 창에 알리기 위해 필요 (네이티브에서는 no-op)
WebBrowser.maybeCompleteAuthSession();

const KAKAO_REST_API_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;
const NAVER_CLIENT_ID = process.env.EXPO_PUBLIC_NAVER_CLIENT_ID;
const redirectTo = Linking.createURL('auth-callback');

/**
 * 네이버에 넘기는 콜백 주소.
 *
 * 네이버는 Callback URL로 http/https만 받는다. 앱(kickday://)은 등록 자체가 안 되므로
 * 실기기에서는 https 중계 페이지(web/auth/naver/index.html)를 거쳐 앱 스킴으로 돌아온다.
 * 웹에서는 지금 열려 있는 주소가 이미 http라 중계가 필요 없다.
 *
 * ⚠ 이 두 주소는 네이버 개발자센터 Callback URL에 모두 등록되어 있어야 한다.
 */
const naverRedirectUri = Platform.OS === 'web' ? redirectTo : 'https://kickday.app/auth/naver';

/**
 * Edge Function 오류를 읽을 수 있는 문구로 바꾼다.
 *
 * supabase-js는 함수가 4xx/5xx를 주면 "Edge Function returned a non-2xx status code"만 던진다.
 * 정작 함수는 본문에 사유를 담아 보내는데(네이버 토큰 교환 실패 같은) 그게 통째로 버려져서,
 * 화면에도 로그에도 원인이 남지 않았다. 응답 본문을 꺼내 붙인다.
 */
async function functionError(err: unknown): Promise<Error> {
  const res = (err as { context?: Response }).context;
  if (res && typeof res.json === 'function') {
    try {
      const body = await res.json();
      // detail은 문자열일 때도, 공급자가 준 객체일 때도 있다
      const detail =
        typeof body?.detail === 'string'
          ? body.detail
          : body?.detail?.error_description ?? body?.detail?.error ?? null;
      const message = [body?.error, detail].filter(Boolean).join(' — ');
      if (message) return new Error(message);
    } catch {
      // 본문이 JSON이 아니면 원래 오류를 그대로 쓴다
    }
  }
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * 비밀번호 재설정 링크가 돌아올 곳 — 요청한 그 환경으로 돌아온다.
 *
 * 한때 웹에서 요청해도 앱 스킴(kickday://)을 쓰도록 고정했었는데, 그러면 PC에서는
 * 링크를 눌러도 그 스킴을 아는 앱이 없어 빈 화면만 남는다. 개발 중 확인할 방법이 사라진다.
 *
 * Linking.createURL은 실행 환경에 맞는 주소를 만들어준다:
 *   웹        http://localhost:8082/auth-callback   → 그 브라우저에서 바로 이어진다
 *   Expo Go   exp://192.168.x.x:8081/--/auth-callback
 *   설치된 앱  kickday://auth-callback
 *
 * 실사용에서는 사용자가 폰 앱에서 요청하므로 앱 스킴이 박힌다.
 */
const passwordResetRedirectTo = redirectTo;

/** edge function이 돌려준 token_hash로 실제 Supabase 세션을 발급받는다 — 웹/네이티브 공통 마지막 단계 */
async function verifyWithTokenHash(tokenHash: string) {
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  if (error) throw error;
  return data.session;
}

/**
 * 네이티브(iOS/Android) — 카카오톡 앱이 깔려 있으면 앱으로 바로 넘어가 확인만 하면 되는
 * 진짜 "간편로그인". 카카오톡이 없으면 SDK가 알아서 웹 로그인으로 폴백한다.
 * app.json의 @react-native-seoul/kakao-login 플러그인에 실제 네이티브 앱 키를 넣어야 동작한다.
 */
async function signInWithKakaoNative() {
  const token = await kakaoNativeLogin();
  if (!token?.accessToken) throw new Error('카카오 로그인에 실패했습니다.');

  const { data: fnData, error: fnError } = await supabase.functions.invoke('kakao-login', {
    body: { access_token: token.accessToken },
  });
  if (fnError) throw await functionError(fnError);

  const tokenHash = fnData?.token_hash;
  if (!tokenHash) throw new Error('로그인 처리에 실패했습니다.');
  return verifyWithTokenHash(tokenHash);
}

/**
 * 웹 — 네이티브 카카오 SDK가 없어서 브라우저로 카카오 인가 페이지를 연다.
 * Supabase 내장 Kakao provider는 account_email 스코프를 강제로 포함시켜서
 * (비즈 인증 없이는 카카오 콘솔에서 설정 자체가 불가능) 직접 카카오와 인가 코드를 교환한다.
 */
async function signInWithKakaoWeb() {
  if (!KAKAO_REST_API_KEY) {
    throw new Error('EXPO_PUBLIC_KAKAO_REST_API_KEY 환경변수가 없습니다.');
  }

  const authUrl = `https://kauth.kakao.com/oauth/authorize?client_id=${encodeURIComponent(
    KAKAO_REST_API_KEY
  )}&redirect_uri=${encodeURIComponent(redirectTo)}&response_type=code&scope=${encodeURIComponent(
    'profile_nickname profile_image'
  )}`;

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);
  if (result.type !== 'success' || !result.url) {
    return null;
  }

  const { params, errorCode } = QueryParams.getQueryParams(result.url);
  if (errorCode) throw new Error(errorCode);

  const code = params.code;
  if (!code) return null;

  const { data: fnData, error: fnError } = await supabase.functions.invoke('kakao-login', {
    body: { code, redirect_uri: redirectTo },
  });
  if (fnError) throw await functionError(fnError);

  const tokenHash = fnData?.token_hash;
  if (!tokenHash) throw new Error('로그인 처리에 실패했습니다.');
  return verifyWithTokenHash(tokenHash);
}

export async function signInWithKakao() {
  return Platform.OS === 'web' ? signInWithKakaoWeb() : signInWithKakaoNative();
}

/**
 * 네이버 — Supabase 내장 provider가 아니라 카카오와 같은 방식으로 직접 처리한다.
 * 인가 코드를 naver-login edge function에 넘기면 token_hash를 돌려준다.
 *
 * 동작 조건: EXPO_PUBLIC_NAVER_CLIENT_ID(.env) + naver-login 함수 배포 +
 *           NAVER_CLIENT_ID/NAVER_CLIENT_SECRET 시크릿.
 */
export async function signInWithNaver() {
  if (!NAVER_CLIENT_ID) {
    throw new Error('네이버 로그인이 아직 설정되지 않았어요');
  }
  // 네이버는 state를 필수로 요구하고, 콜백에서 돌려준 값을 그대로 검증에 쓴다(CSRF 방지)
  const state = Math.random().toString(36).slice(2);
  const authUrl =
    `https://nid.naver.com/oauth2.0/authorize?response_type=code` +
    `&client_id=${encodeURIComponent(NAVER_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(naverRedirectUri)}` +
    `&state=${encodeURIComponent(state)}`;

  // 브라우저가 돌아오길 기다리는 주소는 여전히 앱 스킴이다 —
  // 중계 페이지가 https로 받아 kickday://로 넘겨주기 때문이다.
  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);
  if (result.type !== 'success' || !result.url) return null;

  const { params, errorCode } = QueryParams.getQueryParams(result.url);
  if (errorCode) throw new Error(errorCode);
  if (!params.code) return null;
  if (params.state !== state) throw new Error('로그인 검증에 실패했습니다.');

  const { data: fnData, error: fnError } = await supabase.functions.invoke('naver-login', {
    // 토큰 교환의 redirect_uri는 인가 때 쓴 값과 글자 하나까지 같아야 한다
    body: { code: params.code, state, redirect_uri: naverRedirectUri },
  });
  if (fnError) throw await functionError(fnError);

  const tokenHash = fnData?.token_hash;
  if (!tokenHash) throw new Error('로그인 처리에 실패했습니다.');
  return verifyWithTokenHash(tokenHash);
}

/**
 * Supabase 내장 OAuth(구글·애플).
 *
 * 카카오처럼 직접 인가 코드를 교환하지 않아도 되는 provider들이다 — Supabase 대시보드의
 * Authentication > Providers에서 켜고 키를 넣으면 그대로 동작한다. 그래서 SDK를 새로
 * 붙이지 않는다(설치·prebuild 없이 expo-web-browser만으로 끝난다).
 *
 * 네이버는 Supabase 내장 provider가 아니라 여기 없다 — 카카오처럼 edge function을
 * 하나 더 만들어야 붙는다.
 */
export type OAuthProvider = 'google' | 'apple';

export async function signInWithOAuth(provider: OAuthProvider) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('로그인 주소를 받지 못했습니다.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success' || !result.url) return null;

  const { params, errorCode } = QueryParams.getQueryParams(result.url);
  if (errorCode) throw new Error(errorCode);

  // provider에 따라 코드 교환(PKCE) 또는 토큰이 바로 온다 — 둘 다 받는다
  if (params.access_token && params.refresh_token) {
    const { data: sessionData, error: setError } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (setError) throw setError;
    return sessionData.session;
  }
  if (params.code) {
    const { data: sessionData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
    if (exchangeError) throw exchangeError;
    return sessionData.session;
  }
  return null;
}

/** 이메일 + 비밀번호 로그인 */
export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  return data.session;
}

/**
 * 이메일 회원가입.
 *
 * Supabase 프로젝트에서 이메일 확인이 켜져 있으면 session이 null로 온다 —
 * 그건 실패가 아니라 "메일함을 확인하라"는 뜻이라 호출부가 구분할 수 있게 알려준다.
 */
export async function signUpWithPassword(email: string, password: string, displayName: string) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { data: { full_name: displayName.trim() }, emailRedirectTo: redirectTo },
  });
  if (error) throw error;
  return { session: data.session, needsEmailConfirm: !data.session };
}

/**
 * 비밀번호 재설정 메일의 링크로 앱이 열렸을 때 — 그 링크에 담긴 토큰으로 세션을 세운다.
 *
 * detectSessionInUrl을 꺼둔 클라이언트(lib/supabase.ts)라 자동으로 처리되지 않아 직접 읽는다.
 * provider 설정에 따라 토큰이 바로 오기도 하고(implicit) 코드로 오기도 한다(PKCE) — 둘 다 받는다.
 */
export async function completeRecovery(url: string) {
  const { params } = QueryParams.getQueryParams(url);

  if (params.access_token && params.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (error) throw error;
    return true;
  }
  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) throw error;
    return true;
  }
  return false;
}

/** 재설정 화면에서 새 비밀번호를 저장한다 (세션이 이미 선 상태여야 한다) */
export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: passwordResetRedirectTo,
  });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
