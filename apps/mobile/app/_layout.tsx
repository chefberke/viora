import '../global.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { authClient } from '@/shared/lib';
import { LoadingScreen } from '@/shared/ui';
import { ThemeProvider, useTheme } from '@/theme';

// One transparent retry knocks out blips on a phone network; 30 s of staleness is fine
// for data this screen itself keeps up to date after every parse.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <RootNavigator />
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * The auth gate. `Stack.Protected` drops a group when its guard is false and the router
 * moves to whatever is still reachable, which is why no screen navigates after sign-in.
 */
function RootNavigator() {
  const { colors } = useTheme();
  const { data: session, isPending } = authClient.useSession();

  // Rendering the Stack here would mount the welcome screen and then drop it the moment
  // the cached session arrives.
  if (isPending) {
    return (
      <>
        <StatusBar style="auto" />
        <LoadingScreen message="Loading your profile..." />
      </>
    );
  }

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
      >
        <Stack.Protected guard={Boolean(session)}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>

        <Stack.Protected guard={!session}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
