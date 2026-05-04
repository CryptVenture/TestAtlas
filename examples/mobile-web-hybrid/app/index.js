import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import SharedButton from '../components/shared-button.js';

// Home screen — universal: renders the same on iOS, Android, and web via
// `react-native-web`.
export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>TestAtlas — Mobile Web Hybrid</Text>
      <Text style={styles.body}>
        A minimal Expo Router universal example demonstrating mobile + web mappable concerns.
      </Text>
      <Link href="/login" asChild>
        <SharedButton label="Sign in" />
      </Link>
      <Link href="/(tabs)/feed" asChild>
        <SharedButton label="Open feed" />
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  heading: { fontSize: 24, fontWeight: '600' },
  body: { fontSize: 14, textAlign: 'center', maxWidth: 320 },
});
