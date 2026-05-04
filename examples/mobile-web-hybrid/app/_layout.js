import { Stack } from 'expo-router';

// Root navigator. The (tabs) group provides the bottom-tab UI for the main
// app surface; login is presented modally.
export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Home' }} />
      <Stack.Screen name="login" options={{ title: 'Sign in', presentation: 'modal' }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
