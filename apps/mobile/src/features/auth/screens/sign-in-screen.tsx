import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button, ErrorText } from '@/shared/ui';
import { AuthFooterLink } from '../components/auth-footer-link';
import { AuthLayout } from '../components/auth-layout';
import { useAuthActions } from '../use-auth-actions';

/** The choice of provider. Nothing navigates on success — the session guard does that. */
export function SignInScreen() {
  const router = useRouter();
  const { signInWithGoogle, isPending, error } = useAuthActions();

  return (
    <AuthLayout
      title="Welcome back"
      subtitles={['Sign in to your account']}
      showBack
      actions={
        <>
          {error ? (
            <View className="mb-4">
              <ErrorText className="mt-0">{error}</ErrorText>
            </View>
          ) : null}

          <Button
            label="Continue with Google"
            variant="surface"
            icon={{ name: 'logo-google', className: 'text-foreground' }}
            loading={isPending}
            onPress={signInWithGoogle}
          />

          <View className="h-3" />

          <Button
            label="Continue with Email"
            disabled={isPending}
            onPress={() => router.push('/sign-in-email')}
          />

          <AuthFooterLink
            prompt="Don't have an account?"
            action="Sign up"
            onPress={() => router.push('/sign-up-email')}
          />
        </>
      }
    />
  );
}
