import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { RootNavigator } from './src/navigation/RootNavigator';
import { usePendingInviteStore } from './src/features/team/stores/pendingInviteStore';
import { usePendingSettlementStore } from './src/features/settlement/stores/pendingSettlementStore';
import { useAuthStore } from './src/features/auth/stores/authStore';
import { settlementIdFromParsed } from './src/features/settlement/links';
import { useAppFonts } from './src/lib/fonts';
import { applyWebViewportFix } from './src/lib/webViewport';
import { colors } from './src/theme';
import { DialogHost } from './src/components/Dialog';

applyWebViewportFix();

/** 쿼리든 프래그먼트든 상관없이 값을 꺼낸다 — Supabase는 둘 다 쓴다 */
function paramOf(url: string, key: string) {
  const m = url.match(new RegExp(`[#?&]${key}=([^&]*)`));
  return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
}

function handleIncomingUrl(url: string | null) {
  if (!url) return;
  const parsed = Linking.parse(url);

  // 만료됐거나 이미 쓴 링크는 type=recovery 없이 오류만 달고 돌아온다.
  // 아래 recovery 검사보다 먼저 걸러야 한다 — 안 그러면 아무 설명 없는 로그인 화면만 남는다.
  if (paramOf(url, 'error') || paramOf(url, 'error_code')) {
    useAuthStore
      .getState()
      .reportLinkError(paramOf(url, 'error_code'), paramOf(url, 'error_description'));
    return;
  }

  const code = parsed.queryParams?.code;
  if (parsed.hostname === 'join' && typeof code === 'string') {
    usePendingInviteStore.getState().setCode(code);
    return;
  }

  // 비밀번호 재설정 메일의 링크 — 토큰으로 세션을 세우고 새 비밀번호 화면을 띄운다.
  // (type=recovery는 쿼리에도 프래그먼트에도 올 수 있어 원본 문자열로도 확인한다)
  const isRecovery = parsed.queryParams?.type === 'recovery' || /type=recovery/.test(url);
  if (isRecovery) {
    useAuthStore.getState().startRecovery(url);
    return;
  }

  // 정산 링크 — kickday://settlement/{id}
  const settlementId = settlementIdFromParsed(parsed.hostname ?? null, parsed.path ?? null);
  if (settlementId) {
    usePendingSettlementStore.getState().setId(settlementId);
  }
}

export default function App() {
  // 폰트 로딩 상태와 무관하게 항상 렌더링한다 - 폰트 로딩이 늦거나 실패해도
  // 화면 자체가 안 뜨는 일이 없어야 한다. 로딩 전에는 시스템 폰트로 보이다가
  // 로딩이 끝나면 적용되는 게 맞는 동작이다.
  useAppFonts();

  useEffect(() => {
    Linking.getInitialURL().then(handleIncomingUrl);
    const subscription = Linking.addEventListener('url', ({ url }) => handleIncomingUrl(url));
    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.bgRoot }}>
        <RootNavigator />
        {/* 확인·알림 대화상자가 그려지는 자리 (웹 전용, 네이티브에선 아무것도 안 그린다).
            네비게이터 위에 둬야 모달 위에서 물어도 가려지지 않는다 */}
        <DialogHost />
        <StatusBar style="light" />
      </View>
    </SafeAreaProvider>
  );
}
