import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useWatchlists, useDeleteWatchlist } from '../../src/hooks/useWatchlists';
import { useAuthStore } from '../../src/stores/authStore';
import { useUIStore } from '../../src/stores/uiStore';
import { WatchlistCard } from '../../src/components/watchlist/WatchlistCard';
import { Colors, Typography, FontSize, Spacing, Radius } from '../../src/constants/theme';
import { GATES } from '../../src/constants/config';
import type { DbWatchlist } from '../../src/types/database';

export default function WatchlistsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, isLoading } = useWatchlists();
  const deleteWatchlist = useDeleteWatchlist();
  const profile = useAuthStore((s) => s.profile);
  const showPaywall = useUIStore((s) => s.showPaywall);

  const tier = profile?.subscription_tier ?? 'free';
  const maxOwned = GATES.maxWatchlists[tier];

  const handleCreate = () => {
    if ((data?.owned.length ?? 0) >= maxOwned) {
      showPaywall('Create more watchlists');
      return;
    }
    router.push('/watchlist/create');
  };

  const handleLongPress = (wl: DbWatchlist) => {
    if (wl.owner_id !== profile?.id) return;
    Alert.alert('Delete Watchlist', `Delete "${wl.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteWatchlist.mutate(wl.id),
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Watchlists</Text>
        <Pressable style={styles.createBtn} onPress={handleCreate}>
          <LinearGradient
            colors={Colors.gradient.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.createGradient}
          >
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path d="M12 5V19M5 12H19" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" />
            </Svg>
            <Text style={styles.createText}>New</Text>
          </LinearGradient>
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.xl }} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
        >
          {(data?.owned.length ?? 0) > 0 && (
            <>
              <Text style={styles.sectionLabel}>Mine</Text>
              <View style={styles.grid}>
                {data!.owned.map((wl) => (
                  <View key={wl.id} style={styles.gridItem}>
                    <WatchlistCard watchlist={wl} onLongPress={() => handleLongPress(wl)} />
                  </View>
                ))}
              </View>
            </>
          )}

          {(data?.collaborative.length ?? 0) > 0 && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: Spacing.xl }]}>Shared with Me</Text>
              <View style={styles.grid}>
                {data!.collaborative.map((wl) => (
                  <View key={wl.id} style={styles.gridItem}>
                    <WatchlistCard watchlist={wl} />
                  </View>
                ))}
              </View>
            </>
          )}

          {(data?.owned.length ?? 0) === 0 && (data?.collaborative.length ?? 0) === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🎬</Text>
              <Text style={styles.emptyTitle}>No watchlists yet</Text>
              <Text style={styles.emptySubtitle}>
                Create your first watchlist to start tracking movies and shows.
              </Text>
              <Pressable style={styles.emptyBtn} onPress={handleCreate}>
                <Text style={styles.emptyBtnText}>Create Watchlist</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  title: {
    color: Colors.text.bright,
    fontFamily: Typography.heading,
    fontSize: FontSize.xxl,
    letterSpacing: -0.5,
  },
  createBtn: {
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  createGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
  },
  createText: {
    color: '#fff',
    fontFamily: Typography.bodySemiBold,
    fontSize: FontSize.sm,
  },
  content: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
  },
  sectionLabel: {
    color: Colors.text.dim,
    fontFamily: Typography.bodyMedium,
    fontSize: FontSize.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  gridItem: {
    width: '48%',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing.xxl * 2,
    gap: Spacing.md,
  },
  emptyEmoji: {
    fontSize: 60,
  },
  emptyTitle: {
    color: Colors.text.bright,
    fontFamily: Typography.heading,
    fontSize: FontSize.xxl,
  },
  emptySubtitle: {
    color: Colors.text.dim,
    fontFamily: Typography.body,
    fontSize: FontSize.md,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 22,
  },
  emptyBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    marginTop: Spacing.md,
  },
  emptyBtnText: {
    color: '#fff',
    fontFamily: Typography.bodySemiBold,
    fontSize: FontSize.md,
  },
});
