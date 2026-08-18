import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authClient } from '@/shared/lib';
import { EMPTY_TOTALS } from '../constants';
import type { ComposerState } from '../types';
import { ComposerToolbar } from '../components/composer-toolbar';
import { LogHeader } from '../components/log-header';
import { MacroSummaryBar } from '../components/macro-summary-bar';
import { MealComposer } from '../components/meal-composer';

export interface TodayScreenProps {
  /** A prop only while the UI is static. It becomes local state driven by input focus. */
  state?: ComposerState;
}

/** Placeholder figures until the data layer exists. */
const MOCK = {
  idle: { totals: EMPTY_TOTALS },
  composing: { totals: EMPTY_TOTALS, draft: ['small hamburger'] },
} as const;

export function TodayScreen({ state = 'idle' }: TodayScreenProps) {
  const insets = useSafeAreaInsets();
  const isComposing = state === 'composing';

  // Cached, so the header greets by name on the first frame.
  const { data: session } = authClient.useSession();

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <LogHeader name={session?.user.name} memberSince={session?.user.createdAt} />

      <MealComposer
        initialEntries={isComposing ? MOCK.composing.draft : undefined}
        status={isComposing ? 'reading' : 'idle'}
      />

      {/* The bottom slot swaps: a summary when idle, the entry controls while composing. */}
      <View className="px-4" style={{ paddingBottom: insets.bottom + 8 }}>
        {isComposing ? (
          <ComposerToolbar calories={MOCK.composing.totals.calories} />
        ) : (
          <MacroSummaryBar totals={MOCK.idle.totals} />
        )}
      </View>
    </View>
  );
}
