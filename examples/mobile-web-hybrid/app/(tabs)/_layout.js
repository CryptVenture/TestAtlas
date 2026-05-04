import { Tabs } from 'expo-router';

// Bottom tabs: feed + profile. Universal — the web build renders the same
// component graph through react-native-web.
export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="feed" options={{ title: 'Feed' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
