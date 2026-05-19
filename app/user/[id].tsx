import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '../../src/lib/supabase';
import { Avatar } from '../../src/components/ui/Avatar';
import { PillBadge } from '../../src/components/ui/PillBadge';
import { WatchlistCard } from '../../src/components/watchlist/WatchlistCard';
import { Colors, Typography, FontSize, Spacing, Radius } from '../../src/constants/theme';
import type { DbWatchlist } from '../../src/types/database';

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data: user, isLoading } = useQuery({
    queryKey: ['user', id],
    queryFn: async () => {
      const { data } = await supabase.from('users').select('*').eq('id', id).single();
      return data;
    },
    enabled: !!id,
  });

  const { data: publicWatchlists } = useQuery({
    queryKey: ['user-watchlists', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('watchlists')
        .select('*')
        .eq('owner_id', id)
        .eq('visibility', 'public')
        .order('item_count', { ascending: false });
      return (data ?? []) as DbWatchlist[];
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  const tierLabel: Record<string, string> = {
    free: 'Free',
    premium: 'Premium ⭐',
    premium_plus: 'Premium+ 🌟',
  };
  const tierDisplay = tierLabel[user?.subscription_tier ?? 'free'] ?? 'Free';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top, paddingBottom: insets.bottom + 20 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Pressable style={styles.backBtn} onPress={() => router.back()}>
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <Path
            d="M19 12H5M5 12L12 19M5 12L12 5"
            stroke={Colors.text.dim}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Pressable>

      <View style={styles.profileSection}>
        <Avatar uri={user?.avatar_url} name={user?.display_name ?? user?.username} size={72} />
        <Text style={styles.displayName}>{user?.display_name ?? user?.username}</Text>
        <Text style={styles.username}>@{user?.username}</Text>
        <PillBadge
          label={tierDisplay}
          variant={user?.subscription_tier !== 'free' ? 'gradient' : 'outline'}
        />
      </View>

      {user?.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statNum}>{user?.xp_total?.toLocaleString() ?? 0}</Text>
          <Text style={styles.statLabel}>XP</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statNum}>{publicWatchlists?.length ?? 0}</Text>
          <Text style={styles.statLabel}>Lists</Text>
        </View>
      </View>

      {(publicWatchlists ?? []).length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Watchlists</Text>
          <View style={styles.grid}>
            {publicWatchlists!.map((wl) => (
              <View key={wl.id} style={styles.gridItem}>
                <WatchlistCard watchlist={wl} />
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  centered: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: Spacing.md },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  profileSection: {
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
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
  bio: {
    color: Colors.text.dim,
    fontFamily: Typography.body,
    fontSize: FontSize.md,
    lineHeight: 22,
    textAlign: 'center',
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
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  gridItem: { width: '48%' },
});
