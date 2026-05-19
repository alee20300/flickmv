import React from 'react';
import { Pressable, Text, View, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { backdropUrl, posterUrl, mediaTitle, mediaYear } from '../../lib/tmdb';
import { Colors, Typography, FontSize, Radius, Spacing } from '../../constants/theme';
import { PillBadge } from '../ui/PillBadge';
import type { TMDBMediaItem } from '../../types/tmdb';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - Spacing.md * 2;
const CARD_HEIGHT = CARD_WIDTH * 0.56;

interface Props {
  item: TMDBMediaItem;
}

export function HeroCard({ item }: Props) {
  const router = useRouter();
  const type = item.media_type === 'tv' ? 'tv' : 'movie';
  const imageUri = backdropUrl(item.backdrop_path, 'w780') ?? posterUrl(item.poster_path, 'w500');
  const title = mediaTitle(item);
  const year = mediaYear(item);
  const rating = item.vote_average?.toFixed(1);

  return (
    <Pressable
      style={({ pressed }) => [styles.container, { opacity: pressed ? 0.9 : 1 }]}
      onPress={() => router.push({ pathname: '/title/[id]', params: { id: item.id, type } })}
    >
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={styles.image}
          contentFit="cover"
          transition={400}
        />
      ) : (
        <View style={[styles.image, styles.placeholder]}>
          <Text style={styles.placeholderText}>{title[0]}</Text>
        </View>
      )}
      <LinearGradient
        colors={['transparent', 'rgba(8,8,10,0.6)', 'rgba(8,8,10,0.95)']}
        style={styles.gradient}
      />
      <View style={styles.info}>
        <View style={styles.badges}>
          <PillBadge label={type === 'tv' ? 'TV Show' : 'Movie'} variant="subtle" />
          {rating && Number(rating) > 0 && (
            <PillBadge label={`⭐ ${rating}`} variant="subtle" style={styles.ratingBadge} />
          )}
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {year ? <Text style={styles.year}>{year}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.bg.card,
  },
  image: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  placeholder: {
    backgroundColor: Colors.bg.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: Colors.text.muted,
    fontSize: 48,
    fontFamily: Typography.heading,
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '70%',
  },
  info: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.md,
  },
  badges: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  ratingBadge: {
    marginLeft: Spacing.xs,
  },
  title: {
    color: Colors.text.bright,
    fontFamily: Typography.heading,
    fontSize: FontSize.xl,
    lineHeight: 26,
  },
  year: {
    color: Colors.text.dim,
    fontFamily: Typography.body,
    fontSize: FontSize.sm,
    marginTop: 2,
  },
});
