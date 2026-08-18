import { useRouter } from 'expo-router';

import { Button } from '@/shared/ui';
import { AuthFooterLink } from '../components/auth-footer-link';
import { AuthLayout } from '../components/auth-layout';

// Both buttons lead to the same screen: sign-in already offers a sign-up link.
export function WelcomeScreen() {
  const router = useRouter();

  return (
    <AuthLayout
      title="Welcome to Viora"
      subtitles={[
        'The most frictionless calorie tracking app in the world.',
        'Built so you stick with it.',
      ]}
      actions={
        <>
          <Button label="Get Started" onPress={() => router.push('/sign-in')} />
          <AuthFooterLink
            prompt="Already have an account?"
            action="Sign in"
            onPress={() => router.push('/sign-in')}
          />
        </>
      }
    />
  );
}
