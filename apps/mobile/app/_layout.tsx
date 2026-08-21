import '../global.css';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Imported for its side effect as much as for the name: it teaches TanStack Query whether
// the phone is on a network, and it has to be installed before the first query runs.
import { authClient, logError, messageForError, onlineManager } from '@/shared/lib';
import { LoadingScreen } from '@/shared/ui';
import { ThemeProvider, useTheme } from '@/theme';

// One transparent retry knocks out blips on a phone network; 30 s of staleness is fine
// for data this screen itself keeps up to date after every parse.
//
// The two caches exist for one reason: every failure gets written down. Screens still
// handle the errors they can act on — a 409 on a correction means something specific and
// is caught where it happens — but the ones nobody catches used to leave nothing at all.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
  queryCache: new QueryCache({
    onError: (error, query) =>
      logError(messageForError(error).event, error, { queryKey: query.queryKey }),
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) =>
      logError(messageForError(error).event, error, { mutationKey: mutation.options.mutationKey }),
  }),
});

/**
 * The last line before a white screen.
 *
 * expo-router renders this in place of the whole tree when a render throws, which means it
 * renders OUTSIDE `ThemeProvider` and `SafeAreaProvider` — so it cannot call `useTheme()`,
 * and it cannot use the semantic colour classes, because the CSS variables those resolve
 * to are set by the provider that is no longer mounted. Hence the literal colours here,
 * the only ones in the app. `app/(app)/_layout.tsx` has a second boundary that sits inside
 * the providers and catches everything short of this.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  logError('render_crashed', error, { boundary: 'root' });

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16, backgroundColor: '#000000' }}>
      <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '600', textAlign: 'center' }}>
        Something went wrong.
      </Text>
      <Text style={{ color: '#8E8E93', fontSize: 15, textAlign: 'center' }}>
        Your entries are saved. Reopening the app will not lose anything.
      </Text>
      <Pressable
        onPress={() => void retry()}
        accessibilityRole="button"
        accessibilityLabel="Try again"
        style={{ paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999, backgroundColor: '#1C1C1E' }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 15 }}>Try again</Text>
      </Pressable>
    </View>
  );
}

// Referenced so the side-effect import above cannot be pruned as unused. `isOnline()` is
// also the honest thing to read here: if the manager never installed, this is `true` and
// the app behaves exactly as it did before.
void onlineManager.isOnline();

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
