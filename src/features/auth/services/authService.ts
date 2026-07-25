import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { supabase } from '../../../lib/supabase';

// 웹에서 팝업으로 열린 카카오 인증 창이 리다이렉트 완료를 opener 창에 알리기 위해 필요 (네이티브에서는 no-op)
WebBrowser.maybeCompleteAuthSession();

const KAKAO_REST_API_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY;
const redirectTo = Linking.createURL('auth-callback');

export async function signInWithKakao() {
  if (!KAKAO_REST_API_KEY) {
    throw new Error('EXPO_PUBLIC_KAKAO_REST_API_KEY 환경변수가 없습니다.');
  }

  // Supabase의 내장 Kakao provider는 account_email 스코프를 강제로 포함시켜서
  // (비즈 인증 없이는 카카오 콘솔에서 설정 자체가 불가능) 직접 카카오와 인가 코드를 교환한다.
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
  if (fnError) throw fnError;

  const tokenHash = fnData?.token_hash;
  if (!tokenHash) throw new Error('로그인 처리에 실패했습니다.');

  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
