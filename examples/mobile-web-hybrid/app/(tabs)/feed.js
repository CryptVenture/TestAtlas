import { FlatList, StyleSheet, Text, View } from 'react-native';

const POSTS = [
  { id: '1', title: 'Welcome to the feed', body: 'A virtualised list of mock posts.' },
  { id: '2', title: 'Universal rendering', body: 'Same component renders on iOS, Android, web.' },
  { id: '3', title: 'Mock data', body: 'No network call — for explorer-mapping purposes only.' },
];

export default function FeedScreen() {
  return (
    <FlatList
      style={styles.list}
      data={POSTS}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.body}>{item.body}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  row: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee', gap: 4 },
  title: { fontSize: 16, fontWeight: '600' },
  body: { fontSize: 14, color: '#555' },
});
