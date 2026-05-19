import React from 'react';
import { View } from 'react-native';
import { useTrending } from '../../hooks/useTrending';
import { MediaRow } from '../media/MediaRow';
import { HeroCard } from '../media/HeroCard';
import { SkeletonLoader } from '../ui/SkeletonLoader';
import { Spacing, Radius } from '../../constants/theme';
import type { TMDBMediaItem } from '../../types/tmdb';

export function TrendingSection() {
  const { data, isLoading } = useTrending('week');
  const items = (data?.results ?? []).filter(
    (item): item is TMDBMediaItem => item.media_type !== 'person',
  );

  return (
    <MediaRow
      title="Trending Now"
      data={items}
      renderItem={({ item }) => <HeroCard item={item} />}
      keyExtractor={(item) => `trending-${item.id}`}
      loading={isLoading}
      loadingPlaceholder={
        <>
          <SkeletonLoader
            width={300}
            height={168}
            borderRadius={Radius.lg}
            style={{ marginRight: Spacing.sm }}
          />
          <SkeletonLoader width={300} height={168} borderRadius={Radius.lg} />
        </>
      }
    />
  );
}
