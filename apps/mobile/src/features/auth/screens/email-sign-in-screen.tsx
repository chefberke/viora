import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { Button, ErrorText, TextField } from '@/shared/ui';
import { AuthFooterLink } from '../components/auth-footer-link';
import { AuthLayout } from '../components/auth-layout';
import { useAuthActions } from '../use-auth-actions';

export function EmailSignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signInWithEmail, isPending, error, clearError } = useAuthActions();

  const canSubmit = email.trim().length > 0 && password.length > 0 && !isPending;

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <AuthLayout
        title="Sign in"
        subtitles={['Use the email address you signed up with.']}
        showBack
        actions={
          <>
            {error ? (
              <View className="mb-4">
                <ErrorText className="mt-0">{error}</ErrorText>
              </View>
            ) : null}

            <Button
              label="Sign in"
              loading={isPending}
              disabled={!canSubmit}
              onPress={() => signInWithEmail({ email, password })}
            />

            <AuthFooterLink
              prompt="Don't have an account?"
              action="Sign up"
              onPress={() => router.replace('/sign-up-email')}
            />
          </>
        }
      >
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
          onChangeText={(next) => {
            clearError();
            setPassword(next);
          }}
          placeholder="Your password"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          onSubmitEditing={() => canSubmit && signInWithEmail({ email, password })}
          returnKeyType="go"
        />
      </AuthLayout>
    </KeyboardAvoidingView>
  );
}
