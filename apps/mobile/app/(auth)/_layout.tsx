import { Stack } from 'expo-router';

// Names the screen expo-router falls back to when the root guard drops `(app)`.
export const unstable_settings = { anchor: 'welcome' };

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
