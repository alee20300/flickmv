import { Stack } from 'expo-router';
import { Colors } from '../../src/constants/theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.bg.primary },
        animation: 'fade_from_bottom',
      }}
    />
  );
}
