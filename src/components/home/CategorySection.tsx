import React from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { tmdb } from '../../lib/tmdb';
import { MediaRow } from '../media/MediaRow';
import { PosterCard } from '../media/PosterCard';
import { SkeletonLoader } from '../ui/SkeletonLoader';
import { Spacing, Radius } from '../../constants/theme';
import type { TMDBMediaItem } from '../../types/tmdb';

interface Props {
  title: string;
  queryKey: string[];
  fetcher: () => Promise<{ results: TMDBMediaItem[] }>;
}

function CategorySection({ title, queryKey, fetcher }: Props) {
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: fetcher,
    staleTime: 1000 * 60 * 30,
  });

  const items = (data?.results ?? []).filter(
    (item): item is TMDBMediaItem => item.media_type !== 'person',
  );

  return (
    <MediaRow
      title={title}
      data={items}
      renderItem={({ item }) => <PosterCard item={item} />}
      keyExtractor={(item) => `${queryKey[0]}-${item.id}`}
      loading={isLoading}
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

// ── Pre-wired exports ────────────────────────────────────────────────────────

export function EnglishMoviesSection() {
  return (
    <CategorySection
      title="English Movies"
      queryKey={['category', 'english-movies']}
      fetcher={() => tmdb.discoverMovies({ with_original_language: 'en' })}
    />
  );
}

export function HindiMoviesSection() {
  return (
    <CategorySection
      title="Hindi Movies"
      queryKey={['category', 'hindi-movies']}
      fetcher={() => tmdb.discoverMovies({ with_original_language: 'hi' })}
    />
  );
}

export function TVShowsSection() {
  return (
    <CategorySection
      title="Popular TV Shows"
      queryKey={['category', 'tv-shows']}
      fetcher={() => tmdb.discoverTV()}
    />
  );
}
