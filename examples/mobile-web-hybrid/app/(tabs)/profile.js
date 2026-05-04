import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import SharedButton from '../../components/shared-button.js';
import { logout } from '../../lib/api-client.js';

export default function ProfileScreen() {
  async function onLogout() {
    await logout();
    router.replace('/');
  }
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Profile</Text>
      <Text style={styles.body}>demo@example.com</Text>
      <SharedButton label="Sign out" onPress={onLogout} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12 },
  heading: { fontSize: 22, fontWeight: '600' },
  body: { fontSize: 14, color: '#555' },
});
