import { forwardRef } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

// Universal button — works on iOS, Android, and web via react-native-web.
// Forwards a ref so expo-router's <Link asChild> can attach navigation
// behaviour without losing accessibility props.
const SharedButton = forwardRef(function SharedButton({ label, onPress, ...rest }, ref) {
  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      {...rest}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#007aff',
    alignItems: 'center',
  },
  buttonPressed: { opacity: 0.7 },
  label: { color: '#fff', fontSize: 16, fontWeight: '500' },
});

export default SharedButton;
