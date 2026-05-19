import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
import { posterUrl } from '../../lib/tmdb';
import { Colors, Typography, FontSize, Spacing, Radius } from '../../constants/theme';
import type { DbWatchlistItem } from '../../types/database';

interface Props {
  item: DbWatchlistItem;
  onToggleWatched: (item: DbWatchlistItem) => void;
  onRemove: (itemId: string) => void;
  dragHandle?: React.ReactNode;
}

export function WatchlistItemRow({ item, onToggleWatched, onRemove, dragHandle }: Props) {
  const poster = item.poster_path ? posterUrl(item.poster_path, 'w185') : null;

  return (
    <View style={[styles.row, item.watched && styles.rowWatched]}>
      {dragHandle}
      {poster ? (
        <Image source={{ uri: poster }} style={styles.poster} contentFit="cover" />
      ) : (
        <View style={[styles.poster, styles.posterPlaceholder]}>
          <Text style={styles.posterPlaceholderText}>{item.title[0]}</Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={[styles.title, item.watched && styles.titleWatched]} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.meta}>
          {item.media_type === 'tv' ? 'TV Show' : 'Movie'}
          {item.release_date ? ` · ${item.release_date.slice(0, 4)}` : ''}
          {item.vote_average ? ` · ⭐ ${item.vote_average}` : ''}
        </Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          style={[styles.watchBtn, item.watched && styles.watchBtnActive]}
          onPress={() => onToggleWatched(item)}
        >
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path
              d="M5 13L9 17L19 7"
              stroke={item.watched ? '#fff' : Colors.text.muted}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Pressable>
        <Pressable style={styles.removeBtn} onPress={() => onRemove(item.id)}>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
            <Path
              d="M6 6L18 18M6 18L18 6"
              stroke={Colors.text.muted}
              strokeWidth={2}
              strokeLinecap="round"
            />
          </Svg>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bg.primary,
  },
  rowWatched: {
    opacity: 0.6,
  },
  poster: {
    width: 44,
    height: 66,
    borderRadius: Radius.xs,
  },
  posterPlaceholder: {
    backgroundColor: Colors.bg.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterPlaceholderText: {
    color: Colors.text.muted,
    fontSize: 18,
    fontFamily: Typography.heading,
  },
  info: {
    flex: 1,
  },
  title: {
    color: Colors.text.bright,
    fontFamily: Typography.bodySemiBold,
    fontSize: FontSize.md,
    lineHeight: 20,
    marginBottom: 2,
  },
  titleWatched: {
    textDecorationLine: 'line-through',
    color: Colors.text.muted,
  },
  meta: {
    color: Colors.text.dim,
    fontFamily: Typography.body,
    fontSize: FontSize.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  watchBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.bg.elevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  watchBtnActive: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.bg.elevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
