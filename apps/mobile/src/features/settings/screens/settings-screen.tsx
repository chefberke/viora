import Constants from 'expo-constants';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthActions, useSignInMethods, type DeleteAccountInput } from '@/features/auth';
import { SavedMealsPanel } from '@/features/saved-meals';
import { authClient } from '@/shared/lib';
import { ChangePasswordForm } from '../components/change-password-form';
import { DeleteAccountConfirm } from '../components/delete-account-confirm';
import { DeleteAccountReason } from '../components/delete-account-reason';
import { SettingsHeader } from '../components/settings-header';
import { useLeaveSettings } from '../use-leave-settings';
import { AccountActionsSection } from '../sections/account-actions-section';
import { AccountSection } from '../sections/account-section';
import { AppSection } from '../sections/app-section';
import { MealsSection } from '../sections/meals-section';

/**
 * Deleting is two steps: the reason is asked while backing out is still free, and the
 * irreversible confirmation gets a screen of its own.
 */
type SettingsView = 'menu' | 'password' | 'saved-meals' | 'delete-reason' | 'delete-confirm';

/**
 * The contents of the settings modal, which `app/(app)/_layout.tsx` presents. Four cards:
 * who the account is, the saved meals, the app's own settings, and the two ways out of it.
 *
 * Everything that is not the menu is a view swap rather than a route, because settings is
 * already a full-screen modal and a second presentation on top of one is a shape this app
 * does not use anywhere.
 */
export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<SettingsView>('menu');

  // Cached, so the sheet has a name and an email on its first frame.
  const { data: session } = authClient.useSession();
  const { changePassword, deleteAccount, signOut, isPending, error, clearError } =
    useAuthActions();

  // A Google account has no password, so the row that changes one is not offered.
  const signIn = useSignInMethods();

  const leaveSettings = useLeaveSettings();

  // Held between the two delete steps; nothing is sent until the word is typed.
  const [deletion, setDeletion] = useState<DeleteAccountInput>({ reason: '' });

  const backToMenu = () => {
    clearError();
    setDeletion({ reason: '' });
    setView('menu');
  };

  if (view === 'delete-reason' || view === 'delete-confirm') {
    return (
      <ScrollView
        className="bg-background"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 24,
        }}
      >
        {view === 'delete-reason' ? (
          <DeleteAccountReason
            onBack={backToMenu}
            onContinue={(input) => {
              setDeletion(input);
              setView('delete-confirm');
            }}
          />
        ) : (
          <DeleteAccountConfirm
            email={session?.user.email ?? ''}
            isPending={isPending}
            error={error}
            clearError={clearError}
            onBack={() => {
              clearError();
              setView('delete-reason');
            }}
            onConfirm={() => {
              // Nothing to navigate on the way out: losing the session flips the guard in
              // `app/_layout.tsx`, which drops this group and lands on welcome. The modal
              // is closed first, so it is not what the group remembers — see
              // `use-leave-settings.ts`. A failure keeps it open, with the error.
              void deleteAccount(deletion).then((deleted) => {
                if (deleted) {
                  leaveSettings();
                }
              });
            }}
          />
        )}
      </ScrollView>
    );
  }

  if (view === 'saved-meals') {
    return (
      // Scrolling, unlike the password page: the list has no bound, so it has to be able to
      // run past the screen. A full-screen modal covers the status bar, so the top inset is
      // ours to apply.
      <ScrollView
        className="bg-background"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 24,
        }}
      >
        <SavedMealsPanel onBack={backToMenu} />
      </ScrollView>
    );
  }

  if (view === 'password') {
    return (
      // A full-screen modal covers the status bar, so the top inset is ours to apply.
      <View
        className="bg-background px-5"
        style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }}
      >
        <ChangePasswordForm
          isPending={isPending}
          error={error}
          clearError={clearError}
          onSubmit={changePassword}
          onBack={backToMenu}
          onDone={backToMenu}
        />
      </View>
    );
  }

  return (
    // The ScrollView is the root, with no flex wrapper: the screen has no resolved height
    // of its own, so a `flex-1` child would collapse and take the list with it.
    <ScrollView
      className="bg-background"
      showsVerticalScrollIndicator
      // Index 0 is the header, which pins while everything below it scrolls.
      stickyHeaderIndices={[0]}
      // The modal clears the home indicator, but not by enough to tap the last row.
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
    >
      <SettingsHeader />

      {/* Inset here, not on the content container, so the sticky header runs edge to edge. */}
      <View className="px-5">
        <AccountSection
          name={session?.user.name ?? ''}
          email={session?.user.email ?? ''}
          signIn={signIn}
          disabled={isPending}
          onChangePassword={() => {
            clearError();
            setView('password');
          }}
        />

        <MealsSection onOpenSavedMeals={() => setView('saved-meals')} />
        <AppSection />

        <AccountActionsSection
          disabled={isPending}
          onDeleteAccount={() => {
            clearError();
            setView('delete-reason');
          }}
          onSignOut={() => {
            // Closed before the session goes, so the group does not remember an open modal
            // and reopen it on the next sign-in. See `use-leave-settings.ts`.
            leaveSettings();
            void signOut();
          }}
        />

        {error ? (
          <Text className="mt-4 text-center text-[15px] text-danger">{error}</Text>
        ) : null}

        {/* From app.json, so the two cannot drift. */}
        <Text className="mt-8 text-center text-[11px] text-foreground-subtle">
          {Constants.expoConfig?.version ?? ''}
        </Text>
      </View>
    </ScrollView>
  );
}
