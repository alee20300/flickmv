import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import {
  useWatchlistDetail,
  useToggleWatched,
  useRemoveWatchlistItem,
  useUpdateItemOrder,
} from '../../src/hooks/useWatchlistDetail';
import { useAuthStore } from '../../src/stores/authStore';
import { useWatchlistStore } from '../../src/stores/watchlistStore';
import { supabase } from '../../src/lib/supabase';
import { WatchlistItemRow } from '../../src/components/watchlist/WatchlistItemRow';
import { AddTitleSheet } from '../../src/components/watchlist/AddTitleSheet';
import { Colors, Typography, FontSize, Spacing, Radius } from '../../src/constants/theme';
import type { DbWatchlistItem } from '../../src/types/database';

export default function WatchlistDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const { setReorderingItems } = useWatchlistStore();

  const { watchlistQuery, itemsQuery } = useWatchlistDetail(id);
  const toggleWatched = useToggleWatched(id);
  const removeItem = useRemoveWatchlistItem(id);
  const updateOrder = useUpdateItemOrder(id);

  const [showAddSheet, setShowAddSheet] = useState(false);

  const watchlist = watchlistQuery.data;
  const items = itemsQuery.data ?? [];
  const isOwner = watchlist?.owner_id === profile?.id;

  const handleToggleWatched = async (item: DbWatchlistItem) => {
    await toggleWatched.mutateAsync({ itemId: item.id, watched: !item.watched });
    if (!item.watched && profile?.id) {
      await supabase.rpc('award_xp', {
        p_user_id: profile.id,
        p_amount: 50,
        p_reason: 'mark_watched',
      });
      await supabase.from('activity_feed').insert({
        actor_id: profile.id,
        type: 'watched',
        tmdb_id: item.tmdb_id,
        media_type: item.media_type,
        media_title: item.title,
        poster_path: item.poster_path,
        watchlist_id: id,
      });
    }
  };

  const handleRemove = (itemId: string) => {
    Alert.alert('Remove Title', 'Remove this from the watchlist?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeItem.mutate(itemId) },
    ]);
  };

  const handleDragEnd = async ({ data }: { data: DbWatchlistItem[] }) => {
    const reordered = data.map((item, index) => ({
      ...item,
      sort_order: (index + 1) * 1000,
    }));
    setReorderingItems(id, reordered);
    await updateOrder.mutateAsync(
      reordered.map((item) => ({ id: item.id, sort_order: item.sort_order })),
    );
  };

  const renderItem = ({ item, drag, isActive }: RenderItemParams<DbWatchlistItem>) => (
    <View style={[isActive && styles.dragging]}>
      <WatchlistItemRow
        item={item}
        onToggleWatched={handleToggleWatched}
        onRemove={handleRemove}
        dragHandle={
          <Pressable onLongPress={drag} style={styles.dragHandle}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path
                d="M8 6H8.01M8 12H8.01M8 18H8.01M16 6H16.01M16 12H16.01M16 18H16.01"
                stroke={Colors.text.muted}
                strokeWidth={2}
                strokeLinecap="round"
              />
            </Svg>
          </Pressable>
        }
      />
    </View>
  );

  if (watchlistQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
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
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {watchlist?.title}
          </Text>
          <Text style={styles.headerMeta}>
            {items.length} titles
            {watchlist?.is_collaborative ? ' · Collaborative' : ''}
          </Text>
        </View>
        {(isOwner || watchlist?.is_collaborative) && (
          <Pressable style={styles.addBtn} onPress={() => setShowAddSheet(true)}>
            <LinearGradient
              colors={Colors.gradient.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.addBtnGradient}
            >
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                <Path d="M12 5V19M5 12H19" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" />
              </Svg>
            </LinearGradient>
          </Pressable>
        )}
      </View>

      {watchlist?.description ? (
        <Text style={styles.description}>{watchlist.description}</Text>
      ) : null}

      {itemsQuery.isLoading ? (
        <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.xl }} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🎬</Text>
          <Text style={styles.emptyText}>No titles yet. Add some!</Text>
        </View>
      ) : (
        <DraggableFlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          onDragEnd={handleDragEnd}
          contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        />
      )}

      {showAddSheet && <AddTitleSheet watchlistId={id} onClose={() => setShowAddSheet(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  centered: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    color: Colors.text.bright,
    fontFamily: Typography.heading,
    fontSize: FontSize.xl,
    letterSpacing: -0.3,
  },
  headerMeta: {
    color: Colors.text.dim,
    fontFamily: Typography.body,
    fontSize: FontSize.sm,
    marginTop: 1,
  },
  addBtn: {
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  addBtnGradient: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  description: {
    color: Colors.text.dim,
    fontFamily: Typography.body,
    fontSize: FontSize.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  dragging: {
    opacity: 0.9,
    backgroundColor: Colors.bg.elevated,
  },
  dragHandle: {
    padding: Spacing.sm,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  emptyEmoji: {
    fontSize: 60,
  },
  emptyText: {
    color: Colors.text.dim,
    fontFamily: Typography.body,
    fontSize: FontSize.lg,
  },
});
