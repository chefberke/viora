import Constants from 'expo-constants';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuthActions, type DeleteAccountInput } from '@/features/auth';
import { authClient } from '@/shared/lib';
import { ChangePasswordForm } from '../components/change-password-form';
import { DeleteAccountConfirm } from '../components/delete-account-confirm';
import { DeleteAccountReason } from '../components/delete-account-reason';
import { SettingsHeader } from '../components/settings-header';
import { AccountActionsSection } from '../sections/account-actions-section';
import { AccountSection } from '../sections/account-section';
import { DeviceSection } from '../sections/device-section';
import { PreferencesSection } from '../sections/preferences-section';
import { SavedMealsSection } from '../sections/saved-meals-section';
import { SubscriptionSection } from '../sections/subscription-section';

/**
 * Deleting is two steps: the reason is asked while backing out is still free, and the
 * irreversible confirmation gets a screen of its own.
 */
type SettingsView = 'menu' | 'password' | 'delete-reason' | 'delete-confirm';

/**
 * The contents of the settings modal, which `app/(app)/_layout.tsx` presents. Most of the
 * list is placeholder UI: only the account values, the change-password form, the
 * Appearance row and Sign Out are live.
 */
export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<SettingsView>('menu');

  // Cached, so the sheet has a name and an email on its first frame.
  const { data: session } = authClient.useSession();
  const { changePassword, deleteAccount, signOut, isPending, error, clearError } =
    useAuthActions();

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
              // Nothing to navigate: losing the session flips the guard in
              // `app/_layout.tsx`, which drops this group and lands on welcome.
              void deleteAccount(deletion);
            }}
          />
        )}
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
          disabled={isPending}
          onChangePassword={() => {
            clearError();
            setView('password');
          }}
        />

        <SavedMealsSection />
        <PreferencesSection />
        <DeviceSection />
        <SubscriptionSection />

        <AccountActionsSection
          disabled={isPending}
          onDeleteAccount={() => {
            clearError();
            setView('delete-reason');
          }}
          onSignOut={() => {
            // Nothing to navigate; see the note on the delete confirmation above.
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
