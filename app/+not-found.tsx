import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { Colors, Typography, FontSize, Spacing } from '../src/constants/theme';

export default function NotFound() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>404</Text>
      <Text style={styles.subtitle}>Page not found</Text>
      <Link href="/" style={styles.link}>
        Go Home
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  title: {
    color: Colors.text.bright,
    fontFamily: Typography.heading,
    fontSize: FontSize.display,
  },
  subtitle: {
    color: Colors.text.dim,
    fontFamily: Typography.body,
    fontSize: FontSize.lg,
    marginTop: Spacing.sm,
  },
  link: {
    color: Colors.accent,
    fontFamily: Typography.bodySemiBold,
    fontSize: FontSize.md,
    marginTop: Spacing.xl,
  },
});
