import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Colors, Typography, FontSize, Spacing, Radius } from '../../constants/theme';
import type { DbWatchlist } from '../../types/database';

interface Props {
  watchlist: DbWatchlist;
  onLongPress?: () => void;
}

export function WatchlistCard({ watchlist, onLongPress }: Props) {
  const router = useRouter();

  const visibilityIcon =
    watchlist.visibility === 'public' ? '🌐' : watchlist.visibility === 'friends' ? '👥' : '🔒';

  return (
    <Pressable
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}
      onPress={() => router.push({ pathname: '/watchlist/[id]', params: { id: watchlist.id } })}
      onLongPress={onLongPress}
    >
      {watchlist.is_collaborative && (
        <LinearGradient
          colors={[Colors.accent + '22', Colors.accentPink + '11']}
          style={StyleSheet.absoluteFillObject}
        />
      )}
      <View style={styles.topRow}>
        <Text style={styles.visIcon}>{visibilityIcon}</Text>
        {watchlist.is_collaborative && (
          <View style={styles.collabBadge}>
            <Text style={styles.collabText}>Collab</Text>
          </View>
        )}
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {watchlist.title}
      </Text>
      {watchlist.description ? (
        <Text style={styles.desc} numberOfLines={1}>
          {watchlist.description}
        </Text>
      ) : null}
      <Text style={styles.count}>{watchlist.item_count} titles</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    overflow: 'hidden',
    minHeight: 120,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  visIcon: {
    fontSize: 16,
  },
  collabBadge: {
    backgroundColor: Colors.accent + '22',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  collabText: {
    color: Colors.accent,
    fontFamily: Typography.bodyMedium,
    fontSize: FontSize.xs,
  },
  title: {
    color: Colors.text.bright,
    fontFamily: Typography.bodySemiBold,
    fontSize: FontSize.lg,
    lineHeight: 22,
    marginBottom: Spacing.xs,
  },
  desc: {
    color: Colors.text.dim,
    fontFamily: Typography.body,
    fontSize: FontSize.sm,
    marginBottom: Spacing.sm,
  },
  count: {
    color: Colors.text.muted,
    fontFamily: Typography.body,
    fontSize: FontSize.sm,
    marginTop: 'auto',
  },
});
