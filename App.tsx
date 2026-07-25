import { useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { RootNavigator } from './src/navigation/RootNavigator';
import { usePendingInviteStore } from './src/features/team/stores/pendingInviteStore';
import { useAppFonts, applyGlobalFont } from './src/lib/fonts';

applyGlobalFont();

function handleIncomingUrl(url: string | null) {
  if (!url) return;
  const parsed = Linking.parse(url);
  const code = parsed.queryParams?.code;
  if (parsed.hostname === 'join' && typeof code === 'string') {
    usePendingInviteStore.getState().setCode(code);
  }
}

export default function App() {
  const fontsReady = useAppFonts();

  useEffect(() => {
    Linking.getInitialURL().then(handleIncomingUrl);
    const subscription = Linking.addEventListener('url', ({ url }) => handleIncomingUrl(url));
    return () => subscription.remove();
  }, []);

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: '#07100D' }}>
        {fontsReady && <RootNavigator />}
        <StatusBar style="light" />
      </View>
    </SafeAreaProvider>
  );
}
