import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { Button, ErrorText, TextField } from '@/shared/ui';
import { AuthFooterLink } from '../components/auth-footer-link';
import { AuthLayout } from '../components/auth-layout';
import { MIN_PASSWORD_LENGTH } from '../constants';
import { useAuthActions } from '../use-auth-actions';

export function EmailSignUpScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signUpWithEmail, isPending, error, clearError } = useAuthActions();

  // Nothing to complain about while the field is still empty.
  const passwordError =
    password.length > 0 && password.length < MIN_PASSWORD_LENGTH
      ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
      : undefined;

  const canSubmit =
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= MIN_PASSWORD_LENGTH &&
    !isPending;

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AuthLayout
        title="Create account"
        subtitles={['It takes a few seconds.']}
        showBack
        actions={
          <>
            {error ? (
              <View className="mb-4">
                <ErrorText className="mt-0">{error}</ErrorText>
              </View>
            ) : null}

            <Button
              label="Create account"
              loading={isPending}
              disabled={!canSubmit}
              onPress={() => signUpWithEmail({ name, email, password })}
            />

            <AuthFooterLink
              prompt="Already have an account?"
              action="Sign in"
              onPress={() => router.replace('/sign-in-email')}
            />
          </>
        }
      >
        <TextField
          label="Name"
          value={name}
          onChangeText={(next) => {
            clearError();
            setName(next);
          }}
          placeholder="Your name"
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
        />

        <View className="h-4" />

        <TextField
          label="Email"
          value={email}
          onChangeText={(next) => {
            clearError();
            setEmail(next);
          }}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
        />

        <View className="h-4" />

        <TextField
          label="Password"
          value={password}
          error={passwordError}
          onChangeText={(next) => {
            clearError();
            setPassword(next);
          }}
          placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
        />
      </AuthLayout>
    </KeyboardAvoidingView>
  );
}
