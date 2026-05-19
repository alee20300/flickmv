import React from 'react';
import { View } from 'react-native';
import { useRecommended } from '../../hooks/useRecommended';
import { useTrending } from '../../hooks/useTrending';
import { MediaRow } from '../media/MediaRow';
import { PosterCard } from '../media/PosterCard';
import { SkeletonLoader } from '../ui/SkeletonLoader';
import { Spacing, Radius } from '../../constants/theme';
import type { TMDBMediaItem } from '../../types/tmdb';

export function RecommendedSection() {
  const { data: recommended, isLoading: rLoading } = useRecommended();
  const { data: trending } = useTrending('day');

  // Fall back to trending movies if no genre prefs
  const items = (recommended?.results ?? trending?.results ?? []).filter(
    (item): item is TMDBMediaItem => item.media_type !== 'person',
  );

  return (
    <MediaRow
      title="For You"
      data={items}
      renderItem={({ item }) => <PosterCard item={item} />}
      keyExtractor={(item) => `rec-${item.id}`}
      loading={rLoading}
      loadingPlaceholder={
        <>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonLoader
              key={i}
              width={130}
              height={195}
              borderRadius={Radius.md}
              style={{ marginRight: Spacing.sm }}
            />
          ))}
        </>
      }
    />
  );
}
