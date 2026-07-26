import { useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { RootNavigator } from './src/navigation/RootNavigator';
import { usePendingInviteStore } from './src/features/team/stores/pendingInviteStore';
import { useAppFonts } from './src/lib/fonts';

function handleIncomingUrl(url: string | null) {
  if (!url) return;
  const parsed = Linking.parse(url);
  const code = parsed.queryParams?.code;
  if (parsed.hostname === 'join' && typeof code === 'string') {
    usePendingInviteStore.getState().setCode(code);
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
      <View style={{ flex: 1, backgroundColor: '#07100D' }}>
        <RootNavigator />
        <StatusBar style="light" />
      </View>
    </SafeAreaProvider>
  );
}
