import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useActivityFeed } from '../../hooks/useActivityFeed';
import { Avatar } from '../ui/Avatar';
import { posterUrl } from '../../lib/tmdb';
import { Colors, Typography, FontSize, Spacing, Radius } from '../../constants/theme';

export function FriendsActivitySection() {
  const { data, isLoading } = useActivityFeed();
  const router = useRouter();

  const items = data?.pages.flat().slice(0, 5) ?? [];

  if (!isLoading && items.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Friends Activity</Text>
      {items.map((item) => {
        const actor = item.actor as unknown as
          | { username: string; avatar_url: string | null }
          | undefined;
        const poster = item.poster_path ? posterUrl(item.poster_path, 'w185') : null;

        return (
          <Pressable
            key={item.id}
            style={styles.row}
            onPress={() => {
              if (item.tmdb_id && item.media_type) {
                router.push({
                  pathname: '/title/[id]',
                  params: { id: item.tmdb_id, type: item.media_type },
                });
              }
            }}
          >
            <Avatar uri={actor?.avatar_url} name={actor?.username} size={36} />
            {poster && <Image source={{ uri: poster }} style={styles.poster} contentFit="cover" />}
            <View style={styles.textWrap}>
              <Text style={styles.actorName} numberOfLines={1}>
                {actor?.username ?? 'Someone'}
              </Text>
              <Text style={styles.action} numberOfLines={1}>
                {item.type === 'added_to_watchlist' && `added ${item.media_title ?? 'a title'}`}
                {item.type === 'watched' && `watched ${item.media_title ?? 'something'}`}
                {item.type === 'created_watchlist' &&
                  `created "${item.watchlist_title ?? 'a list'}"`}
                {item.type === 'became_friends' && 'joined FlickMV'}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  sectionTitle: {
    color: Colors.text.bright,
    fontFamily: Typography.heading,
    fontSize: FontSize.lg,
    marginBottom: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  poster: {
    width: 36,
    height: 54,
    borderRadius: Radius.xs,
  },
  textWrap: {
    flex: 1,
  },
  actorName: {
    color: Colors.text.bright,
    fontFamily: Typography.bodySemiBold,
    fontSize: FontSize.sm,
  },
  action: {
    color: Colors.text.dim,
    fontFamily: Typography.body,
    fontSize: FontSize.sm,
  },
});
