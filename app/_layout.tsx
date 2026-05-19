import React, { useEffect, Component, ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Sentry from '@sentry/react-native';
import {
  useFonts,
  Syne_400Regular,
  Syne_700Bold,
  Syne_800ExtraBold,
} from '@expo-google-fonts/syne';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { supabase } from '../src/lib/supabase';
import { useAuthStore } from '../src/stores/authStore';
import { registerPushToken } from '../src/lib/notifications';
import { PaywallSheet } from '../src/components/ui/PaywallSheet';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV !== 'development',
  tracesSampleRate: 0.2,
});

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      gcTime: 1000 * 60 * 60,
      staleTime: 1000 * 60 * 10,
    },
  },
});

// ── Error Boundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={eb.container}>
          <Text style={eb.title}>Something went wrong</Text>
          <Text style={eb.body}>Please restart the app.</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const eb = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#08080a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  body: { color: '#888', fontSize: 15 },
});

// ── Root Layout ───────────────────────────────────────────────────────────────
function RootLayout() {
  const { setSession, fetchProfile, setInitialized } = useAuthStore();

  const [fontsLoaded] = useFonts({
    Syne_400Regular,
    Syne_700Bold,
    Syne_800ExtraBold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id).then(() => {
          setInitialized(true);
          registerPushToken(session.user.id);
        });
      } else {
        setInitialized(true);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <StatusBar style="light" />
            <Slot />
            <PaywallSheet />
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

export default Sentry.wrap(RootLayout);
