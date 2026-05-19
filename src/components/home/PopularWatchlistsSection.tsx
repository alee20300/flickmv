import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { Colors, Typography, FontSize, Spacing, Radius } from '../../constants/theme';
import type { DbWatchlist } from '../../types/database';

const usePopularWatchlists = () =>
  useQuery({
    queryKey: ['popular-watchlists'],
    queryFn: async () => {
      const { data } = await supabase
        .from('watchlists')
        .select('*, owner:users!owner_id(username, avatar_url)')
        .eq('visibility', 'public')
        .order('item_count', { ascending: false })
        .limit(10);
      return (data ?? []) as (DbWatchlist & {
        owner: { username: string; avatar_url: string | null };
      })[];
    },
    staleTime: 1000 * 60 * 5,
  });

export function PopularWatchlistsSection() {
  const { data, isLoading } = usePopularWatchlists();
  const router = useRouter();

  if (!isLoading && (!data || data.length === 0)) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Popular Watchlists</Text>
      <FlatList
        data={data ?? []}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ width: Spacing.sm }} />}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push({ pathname: '/watchlist/[id]', params: { id: item.id } })}
          >
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.cardSub}>
              {item.item_count} titles · by @{(item.owner as any)?.username ?? '?'}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    color: Colors.text.bright,
    fontFamily: Typography.heading,
    fontSize: FontSize.lg,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  listContent: {
    paddingHorizontal: Spacing.md,
  },
  card: {
    width: 180,
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  cardTitle: {
    color: Colors.text.bright,
    fontFamily: Typography.bodySemiBold,
    fontSize: FontSize.md,
    marginBottom: Spacing.xs,
    lineHeight: 20,
  },
  cardSub: {
    color: Colors.text.dim,
    fontFamily: Typography.body,
    fontSize: FontSize.sm,
  },
});
