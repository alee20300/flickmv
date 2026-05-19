import React from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { posterUrl, mediaTitle, mediaYear } from '../../lib/tmdb';
import { Colors, Typography, FontSize, Radius, Spacing } from '../../constants/theme';
import type { TMDBMediaItem } from '../../types/tmdb';

interface Props {
  item: TMDBMediaItem;
  width?: number;
}

export function PosterCard({ item, width = 130 }: Props) {
  const router = useRouter();
  const height = width * 1.5;
  const type = item.media_type === 'tv' ? 'tv' : 'movie';
  const imageUri = posterUrl(item.poster_path, 'w342');
  const title = mediaTitle(item);
  const year = mediaYear(item);

  const rating = item.vote_average ? item.vote_average.toFixed(1) : null;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        { width, height },
        { opacity: pressed ? 0.85 : 1 },
      ]}
      onPress={() => router.push({ pathname: '/title/[id]', params: { id: item.id, type } })}
    >
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={[styles.image, { width, height }]}
          contentFit="cover"
          placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
          transition={300}
        />
      ) : (
        <View style={[styles.placeholder, { width, height }]}>
          <Text style={styles.placeholderText}>{title[0]}</Text>
        </View>
      )}
      <LinearGradient colors={['transparent', 'rgba(8,8,10,0.9)']} style={styles.gradient} />

      {/* Rating badge — top-right corner */}
      {rating && Number(rating) > 0 && (
        <View style={styles.ratingBadge}>
          <Text style={styles.ratingStar}>★</Text>
          <Text style={styles.ratingText}>{rating}</Text>
        </View>
      )}

      <View style={styles.info}>
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
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.bg.card,
  },
  image: {
    position: 'absolute',
  },
  placeholder: {
    position: 'absolute',
    backgroundColor: Colors.bg.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: Colors.text.muted,
    fontSize: 32,
    fontFamily: Typography.heading,
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
  },
  ratingBadge: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.68)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    gap: 2,
  },
  ratingStar: {
    color: '#f0ac3a',
    fontSize: 9,
    lineHeight: 13,
  },
  ratingText: {
    color: '#fff',
    fontFamily: Typography.bodySemiBold,
    fontSize: 10,
    lineHeight: 13,
  },
  info: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.sm,
  },
  title: {
    color: Colors.text.bright,
    fontFamily: Typography.bodyBold,
    fontSize: FontSize.xs,
    lineHeight: 16,
  },
  year: {
    color: Colors.text.dim,
    fontFamily: Typography.body,
    fontSize: FontSize.xs - 1,
    marginTop: 2,
  },
});
