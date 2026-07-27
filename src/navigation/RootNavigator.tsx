import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../features/auth/stores/authStore';
import { LoginScreen } from '../features/auth/screens/LoginScreen';
import { useTeamStore } from '../features/team/stores/teamStore';
import { TeamStartScreen } from '../features/team/screens/TeamStartScreen';
import { useOnboardingStore } from '../features/onboarding/stores/onboardingStore';
import { OnboardingScreen } from '../features/onboarding/screens/OnboardingScreen';
import { MainTabNavigator } from './MainTabNavigator';
import { TeamSettingsScreen } from '../features/team/screens/TeamSettingsScreen';
import { registerForPushNotifications } from '../features/notifications/services/pushService';

const Stack = createNativeStackNavigator();

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: '#07100D', card: '#07100D' },
};

function LoadingScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F1512' }}>
      <ActivityIndicator size="large" color="#4ADE80" />
    </View>
  );
}

export function RootNavigator() {
  const session = useAuthStore((s) => s.session);
  const authInitialized = useAuthStore((s) => s.initialized);

  const teamLoaded = useTeamStore((s) => s.loaded);
  const teamLoading = useTeamStore((s) => s.loading);
  const activeTeam = useTeamStore((s) => s.activeTeam);
  const loadMemberships = useTeamStore((s) => s.loadMemberships);
  const resetTeam = useTeamStore((s) => s.reset);

  const onboardingLoaded = useOnboardingStore((s) => s.loaded);
  const onboardingSeen = useOnboardingStore((s) => s.seen);
  const checkOnboardingSeen = useOnboardingStore((s) => s.checkSeen);
  const markOnboardingSeen = useOnboardingStore((s) => s.markSeen);

  useEffect(() => {
    checkOnboardingSeen();
  }, []);

  useEffect(() => {
    if (session) {
      loadMemberships();
      registerForPushNotifications(session.user.id);
    } else {
      resetTeam();
    }
  }, [session]);

  if (!authInitialized || !onboardingLoaded) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!onboardingSeen ? (
          <Stack.Screen name="Onboarding">
            {() => <OnboardingScreen onDone={markOnboardingSeen} />}
          </Stack.Screen>
        ) : !session ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : !teamLoaded || teamLoading ? (
          <Stack.Screen name="TeamLoading" component={LoadingScreen} />
        ) : !activeTeam ? (
          <Stack.Screen name="TeamOnboarding" component={TeamStartScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabNavigator} />
            <Stack.Screen name="TeamSettings" component={TeamSettingsScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
