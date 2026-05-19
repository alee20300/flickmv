import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/stores/authStore';
import { View, ActivityIndicator } from 'react-native';
import { Colors } from '../src/constants/theme';

export default function Index() {
  const { session, profile, initialized } = useAuthStore();

  if (!initialized) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: Colors.bg.primary,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  if (!session) return <Redirect href="/(auth)/onboarding" />;
  if (!profile?.onboarding_completed) return <Redirect href="/(auth)/profile-setup" />;
  return <Redirect href="/(tabs)" />;
}
