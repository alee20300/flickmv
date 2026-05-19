import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';
import { useUIStore } from '../../src/stores/uiStore';
import { useWatchlists } from '../../src/hooks/useWatchlists';
import { useFriends } from '../../src/hooks/useFriends';
import { Avatar } from '../../src/components/ui/Avatar';
import { PillBadge } from '../../src/components/ui/PillBadge';
import { WatchlistCard } from '../../src/components/watchlist/WatchlistCard';
import { Colors, Typography, FontSize, Spacing, Radius } from '../../src/constants/theme';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, signOut } = useAuthStore();
  const showPaywall = useUIStore((s) => s.showPaywall);
  const { data: watchlists } = useWatchlists();
  const { data: friends } = useFriends();

  const publicWatchlists = watchlists?.owned.filter((w) => w.visibility === 'public') ?? [];

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const tierLabel = {
    free: 'Free',
    premium: 'Premium ⭐',
    premium_plus: 'Premium+ 🌟',
  }[profile?.subscription_tier ?? 'free'];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top, paddingBottom: insets.bottom + 80 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {/* Header glow */}
      <LinearGradient colors={[Colors.accent + '22', 'transparent']} style={styles.headerGlow} />

      {/* Avatar + basic info */}
      <View style={styles.profileSection}>
        <Avatar
          uri={profile?.avatar_url}
          name={profile?.display_name ?? profile?.username}
          size={80}
        />
        <View style={styles.profileInfo}>
          <Text style={styles.displayName}>{profile?.display_name ?? profile?.username}</Text>
          <Text style={styles.username}>@{profile?.username}</Text>
          <View style={styles.badges}>
            <PillBadge
              label={tierLabel}
              variant={profile?.subscription_tier !== 'free' ? 'gradient' : 'outline'}
            />
          </View>
        </View>
      </View>

      {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{profile?.xp_total?.toLocaleString() ?? 0}</Text>
          <Text style={styles.statLabel}>XP</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statNum}>{watchlists?.owned.length ?? 0}</Text>
          <Text style={styles.statLabel}>Watchlists</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statNum}>{friends?.length ?? 0}</Text>
          <Text style={styles.statLabel}>Friends</Text>
        </View>
      </View>

      {/* Public watchlists */}
      {publicWatchlists.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Public Watchlists</Text>
          <View style={styles.watchlistGrid}>
            {publicWatchlists.map((wl) => (
              <View key={wl.id} style={styles.watchlistItem}>
                <WatchlistCard watchlist={wl} />
              </View>
            ))}
          </View>
        </>
      )}

      {/* Settings */}
      <Text style={styles.sectionTitle}>Settings</Text>
      <View style={styles.settingsGroup}>
        {[
          {
            label: 'Edit Profile',
            icon: '✏️',
            onPress: () => router.push('/(auth)/profile-setup'),
          },
          {
            label: 'Notifications',
            icon: '🔔',
            onPress: () => router.push('/notifications'),
          },
          {
            label: 'Subscription',
            icon: '⭐',
            onPress: () => showPaywall('subscription'),
          },
          {
            label: 'Privacy',
            icon: '🔒',
            onPress: () =>
              Alert.alert(
                'Privacy',
                'Your data is stored securely. Watchlists marked "private" are only visible to you. Friend activity is only shown to mutual friends.',
                [{ text: 'Got it' }],
              ),
          },
        ].map((item) => (
          <Pressable key={item.label} style={styles.settingsRow} onPress={item.onPress}>
            <Text style={styles.settingsIcon}>{item.icon}</Text>
            <Text style={styles.settingsLabel}>{item.label}</Text>
            <Text style={styles.settingsChevron}>›</Text>
          </Pressable>
        ))}
        <Pressable style={[styles.settingsRow, styles.signOutRow]} onPress={handleSignOut}>
          <Text style={styles.settingsIcon}>🚪</Text>
          <Text style={[styles.settingsLabel, styles.signOutText]}>Sign Out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  content: { paddingHorizontal: Spacing.md },
  headerGlow: {
    position: 'absolute',
    top: -50,
    right: -50,
    width: 250,
    height: 250,
    borderRadius: 125,
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xl,
  },
  profileInfo: { flex: 1, gap: Spacing.xs },
  displayName: {
    color: Colors.text.bright,
    fontFamily: Typography.heading,
    fontSize: FontSize.xxl,
    letterSpacing: -0.5,
  },
  username: {
    color: Colors.text.dim,
    fontFamily: Typography.body,
    fontSize: FontSize.md,
  },
  badges: { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.xs },
  bio: {
    color: Colors.text.dim,
    fontFamily: Typography.body,
    fontSize: FontSize.md,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.xl,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statNum: {
    color: Colors.text.bright,
    fontFamily: Typography.heading,
    fontSize: FontSize.xxl,
  },
  statLabel: {
    color: Colors.text.muted,
    fontFamily: Typography.body,
    fontSize: FontSize.sm,
  },
  statDivider: { width: 1, backgroundColor: Colors.border },
  sectionTitle: {
    color: Colors.text.bright,
    fontFamily: Typography.heading,
    fontSize: FontSize.lg,
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  watchlistGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  watchlistItem: { width: '48%' },
  settingsGroup: {
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.xl,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
    gap: Spacing.md,
  },
  signOutRow: {
    borderBottomWidth: 0,
  },
  settingsIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  settingsLabel: {
    flex: 1,
    color: Colors.text.bright,
    fontFamily: Typography.bodyMedium,
    fontSize: FontSize.md,
  },
  signOutText: { color: Colors.error },
  settingsChevron: {
    color: Colors.text.muted,
    fontSize: 22,
    lineHeight: 24,
  },
});
