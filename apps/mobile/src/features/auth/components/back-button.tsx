import { useRouter } from 'expo-router';

import { IconButton } from '@/shared/ui';

export function BackButton() {
  const router = useRouter();

  return (
    <IconButton
      accessibilityLabel="Go back"
      icon={{ name: 'arrow-back', className: 'text-foreground' }}
      onPress={() => router.back()}
    />
  );
}
