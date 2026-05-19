import React from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useAuthStore } from '../../src/stores/authStore';
import { useUnreadCount } from '../../src/hooks/useNotifications';
import { TrendingSection } from '../../src/components/home/TrendingSection';
import { RecommendedSection } from '../../src/components/home/RecommendedSection';
import { FriendsActivitySection } from '../../src/components/home/FriendsActivitySection';
import { PopularWatchlistsSection } from '../../src/components/home/PopularWatchlistsSection';
import {
  EnglishMoviesSection,
  HindiMoviesSection,
  TVShowsSection,
} from '../../src/components/home/CategorySection';
import { Colors, Typography, FontSize, Spacing } from '../../src/constants/theme';

function BellIcon({ hasUnread }: { hasUnread: boolean }) {
  return (
    <View>
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <Path
          d="M15 17H20L18.595 15.595C18.212 15.212 18 14.702 18 14.172V11C18 8.038 15.962 5.547 13 5.05V4C13 3.448 12.552 3 12 3C11.448 3 11 3.448 11 4V5.05C8.038 5.548 6 8.038 6 11V14.172C6 14.702 5.788 15.212 5.405 15.595L4 17H9M15 17V18C15 19.657 13.657 21 12 21C10.343 21 9 19.657 9 18V17M15 17H9"
          stroke={Colors.text.dim}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      {hasUnread && <View style={styles.unreadDot} />}
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const unreadCount = useUnreadCount();

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <LinearGradient colors={[Colors.accent + '18', 'transparent']} style={styles.headerGlow} />

      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting()}</Text>
          <Text style={styles.name}>
            {profile?.display_name ?? profile?.username ?? 'Cinephile'}
          </Text>
        </View>
        <Pressable style={styles.bellButton} onPress={() => router.push('/notifications')}>
          <BellIcon hasUnread={unreadCount > 0} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
      >
        <TrendingSection />
        <RecommendedSection />
        <EnglishMoviesSection />
        <HindiMoviesSection />
        <TVShowsSection />
        <FriendsActivitySection />
        <PopularWatchlistsSection />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  headerGlow: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 250,
    height: 250,
    borderRadius: 125,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
  },
  greeting: {
    color: Colors.text.dim,
    fontFamily: Typography.body,
    fontSize: FontSize.sm,
  },
  name: {
    color: Colors.text.bright,
    fontFamily: Typography.heading,
    fontSize: FontSize.xxl,
    letterSpacing: -0.5,
  },
  bellButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bg.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  unreadDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accent,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: 0,
  },
});
