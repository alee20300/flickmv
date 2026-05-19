import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Alert,
  Modal,
  StatusBar,
} from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import Svg, { Path } from 'react-native-svg';
import { tmdb, backdropUrl, posterUrl } from '../../src/lib/tmdb';
import { MediaRow } from '../../src/components/media/MediaRow';
import { PosterCard } from '../../src/components/media/PosterCard';
import { PillBadge } from '../../src/components/ui/PillBadge';
import { GradientButton } from '../../src/components/ui/GradientButton';
import { useWatchlists } from '../../src/hooks/useWatchlists';
import { useAddWatchlistItem } from '../../src/hooks/useWatchlistDetail';
import { useLikeStatus, useToggleLike } from '../../src/hooks/useLikes';
import { Colors, Typography, FontSize, Spacing, Radius } from '../../src/constants/theme';
import type { TMDBMediaItem, TMDBMovieDetail, TMDBTVDetail } from '../../src/types/tmdb';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const BACKDROP_HEIGHT = Math.round(SCREEN_WIDTH * 0.56); // 16:9 aspect ratio

// ── Trailer Modal (landscape) ────────────────────────────────────────────────
function TrailerModal({ videoId, onClose }: { videoId: string; onClose: () => void }) {
  const [dims, setDims] = useState(Dimensions.get('window'));

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setDims(window));
    return () => sub.remove();
  }, []);

  // Fit a 16:9 player inside whatever orientation the phone is in
  const landscape = dims.width > dims.height;
  const playerW = landscape ? dims.width : dims.width;
  const playerH = Math.round(playerW * (9 / 16));

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar hidden />
      <View
        style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}
      >
        <YoutubePlayer
          height={playerH}
          width={playerW}
          videoId={videoId}
          play
          initialPlayerParams={{ autoplay: 1 }}
          onChangeState={(s) => {
            if (s === 'ended') onClose();
          }}
          webViewProps={{
            allowsInlineMediaPlayback: true,
            mediaPlaybackRequiresUserAction: false,
          }}
        />
        <Pressable
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 48,
            right: 16,
            backgroundColor: 'rgba(0,0,0,0.6)',
            borderRadius: 20,
            width: 36,
            height: 36,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 18, lineHeight: 20 }}>✕</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────
export default function TitleDetail() {
  const { id, type } = useLocalSearchParams<{ id: string; type: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [showMore, setShowMore] = useState(false);
  const [showWatchlistPicker, setShowWatchlistPicker] = useState(false);
  const [trailerOpen, setTrailerOpen] = useState(false);

  const isTV = type === 'tv';
  const tmdbId = Number(id);

  const { data: isLiked = false } = useLikeStatus(tmdbId, type as 'movie' | 'tv');
  const toggleLike = useToggleLike();

  const { data: detail, isLoading } = useQuery<TMDBMovieDetail | TMDBTVDetail>({
    queryKey: ['title', tmdbId, type],
    queryFn: () => (isTV ? tmdb.tvDetail(tmdbId) : tmdb.movieDetail(tmdbId)),
    enabled: !!tmdbId,
  });

  const { data: videos } = useQuery({
    queryKey: ['title-videos', tmdbId, type],
    queryFn: () => (isTV ? tmdb.tvVideos(tmdbId) : tmdb.movieVideos(tmdbId)),
    enabled: !!tmdbId,
  });

  const { data: similar } = useQuery({
    queryKey: ['similar', tmdbId, type],
    queryFn: () => tmdb.similar(type as 'movie' | 'tv', tmdbId),
    enabled: !!tmdbId,
  });

  const { data: watchlists } = useWatchlists();

  const trailer =
    videos?.results?.find((v) => v.type === 'Trailer' && v.site === 'YouTube' && v.official) ??
    videos?.results?.find((v) => v.site === 'YouTube');

  const backdropUri = backdropUrl((detail as any)?.backdrop_path, 'w1280');
  const posterUri = posterUrl((detail as any)?.poster_path, 'w342');
  const title = (detail as any)?.title ?? (detail as any)?.name ?? '';
  const year = ((detail as any)?.release_date ?? (detail as any)?.first_air_date ?? '').slice(0, 4);
  const overview = (detail as any)?.overview ?? '';
  const rating = (detail as any)?.vote_average?.toFixed(1);
  const genres: { id: number; name: string }[] = (detail as any)?.genres ?? [];
  const runtime = isTV
    ? `${(detail as any)?.number_of_seasons ?? '?'} seasons`
    : `${(detail as any)?.runtime ?? '?'} min`;

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={Colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Landscape trailer modal */}
      {trailerOpen && trailer && (
        <TrailerModal videoId={trailer.key} onClose={() => setTrailerOpen(false)} />
      )}

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Backdrop ── */}
        <View style={styles.backdropWrap}>
          {backdropUri ? (
            <Image
              source={{ uri: backdropUri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          ) : posterUri ? (
            <Image source={{ uri: posterUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.backdropPlaceholder]} />
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.0)', Colors.bg.primary]}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />

          {/* Back button */}
          <Pressable
            style={[styles.backBtn, { top: insets.top + Spacing.sm }]}
            onPress={() => router.back()}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
              <Path
                d="M19 12H5M5 12L12 19M5 12L12 5"
                stroke={Colors.text.bright}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>

          {/* Play trailer overlay button */}
          {trailer && (
            <Pressable style={styles.playOverlay} onPress={() => setTrailerOpen(true)}>
              <View style={styles.playCircle}>
                <Text style={styles.playIcon}>▶</Text>
              </View>
            </Pressable>
          )}
        </View>

        {/* ── Info ── */}
        <View style={styles.info}>
          <Text style={styles.title}>{title}</Text>

          <View style={styles.metaRow}>
            {year ? <Text style={styles.metaText}>{year}</Text> : null}
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaText}>{runtime}</Text>
            {rating && Number(rating) > 0 && (
              <>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.metaText}>⭐ {rating}</Text>
              </>
            )}
          </View>

          <View style={styles.genreRow}>
            {genres.slice(0, 4).map((g) => (
              <PillBadge key={g.id} label={g.name} variant="subtle" />
            ))}
          </View>

          {/* Actions */}
          <View style={styles.actionsRow}>
            <GradientButton
              label="+ Watchlist"
              onPress={() => setShowWatchlistPicker(!showWatchlistPicker)}
              style={{ flex: 1 }}
            />
            {trailer && (
              <Pressable style={styles.trailerBtn} onPress={() => setTrailerOpen(true)}>
                <Text style={styles.trailerBtnText}>▶ Trailer</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.likeBtn}
              onPress={() =>
                toggleLike.mutate({
                  tmdb_id: tmdbId,
                  media_type: type as 'movie' | 'tv',
                  title,
                  poster_path: (detail as any)?.poster_path ?? null,
                  genre_ids: genres.map((g) => g.id),
                  isLiked,
                })
              }
            >
              <Text style={[styles.likeIcon, isLiked && styles.likeIconActive]}>
                {isLiked ? '♥' : '♡'}
              </Text>
            </Pressable>
          </View>

          {/* Watchlist picker */}
          {showWatchlistPicker && (
            <View style={styles.wlPicker}>
              <Text style={styles.wlPickerTitle}>Add to Watchlist</Text>
              {(watchlists?.owned ?? []).map((wl) => (
                <WatchlistPickerRow
                  key={wl.id}
                  watchlistId={wl.id}
                  watchlistTitle={wl.title}
                  item={{
                    tmdb_id: tmdbId,
                    media_type: type as 'movie' | 'tv',
                    title,
                    poster_path: (detail as any)?.poster_path ?? null,
                    backdrop_path: (detail as any)?.backdrop_path ?? null,
                    overview,
                    release_date:
                      (detail as any)?.release_date ?? (detail as any)?.first_air_date ?? null,
                    vote_average: (detail as any)?.vote_average ?? null,
                  }}
                  onDone={() => setShowWatchlistPicker(false)}
                />
              ))}
            </View>
          )}

          {/* Overview */}
          <Text style={styles.sectionTitle}>Overview</Text>
          <Text style={styles.overview} numberOfLines={showMore ? undefined : 4}>
            {overview || 'No overview available.'}
          </Text>
          {overview.length > 200 && (
            <Pressable onPress={() => setShowMore(!showMore)}>
              <Text style={styles.showMore}>{showMore ? 'Show less' : 'Read more'}</Text>
            </Pressable>
          )}

          {/* Similar */}
          {(similar?.results ?? []).filter((i): i is TMDBMediaItem => i.media_type !== 'person')
            .length > 0 && (
            <View style={{ marginTop: Spacing.xl }}>
              <MediaRow
                title="Similar"
                data={similar!.results
                  .filter((i): i is TMDBMediaItem => i.media_type !== 'person')
                  .slice(0, 10)}
                renderItem={({ item }) => <PosterCard item={item} width={110} />}
                keyExtractor={(item) => `similar-${item.id}`}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ── Watchlist picker row ─────────────────────────────────────────────────────
function WatchlistPickerRow({
  watchlistId,
  watchlistTitle,
  item,
  onDone,
}: {
  watchlistId: string;
  watchlistTitle: string;
  item: Parameters<ReturnType<typeof useAddWatchlistItem>['mutateAsync']>[0];
  onDone: () => void;
}) {
  const addItem = useAddWatchlistItem(watchlistId);

  return (
    <Pressable
      style={styles.wlRow}
      onPress={async () => {
        try {
          await addItem.mutateAsync(item);
          Alert.alert('Added!', `Added to "${watchlistTitle}"`);
          onDone();
        } catch (e: any) {
          if (e.message === 'Already in watchlist') {
            Alert.alert('Already Added', `"${item.title}" is already in "${watchlistTitle}"`);
          } else {
            Alert.alert('Error', e.message);
          }
        }
      }}
    >
      <Text style={styles.wlRowTitle}>{watchlistTitle}</Text>
    </Pressable>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  centered: { alignItems: 'center', justifyContent: 'center' },

  backdropWrap: {
    width: SCREEN_WIDTH,
    height: BACKDROP_HEIGHT,
    backgroundColor: Colors.bg.card,
    overflow: 'hidden',
  },
  backdropPlaceholder: {
    backgroundColor: Colors.bg.elevated,
  },

  backBtn: {
    position: 'absolute',
    left: Spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(8,8,10,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    zIndex: 1,
  },

  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    color: '#fff',
    fontSize: 24,
    marginLeft: 4, // optical center for ▶
  },

  info: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
  },
  title: {
    color: Colors.text.bright,
    fontFamily: Typography.heading,
    fontSize: FontSize.xxxl,
    letterSpacing: -0.5,
    lineHeight: 38,
    marginBottom: Spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  metaText: {
    color: Colors.text.dim,
    fontFamily: Typography.body,
    fontSize: FontSize.md,
  },
  metaDot: { color: Colors.text.muted, fontSize: FontSize.md },
  genreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  trailerBtn: {
    flex: 1,
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
  },
  trailerBtnText: {
    color: Colors.text.bright,
    fontFamily: Typography.bodySemiBold,
    fontSize: FontSize.md,
  },
  likeBtn: {
    width: 48,
    height: 48,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  likeIcon: {
    fontSize: 22,
    color: Colors.text.dim,
  },
  likeIconActive: {
    color: '#e11d48',
  },
  wlPicker: {
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  wlPickerTitle: {
    color: Colors.text.dim,
    fontFamily: Typography.bodyMedium,
    fontSize: FontSize.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  wlRow: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  wlRowTitle: {
    color: Colors.text.bright,
    fontFamily: Typography.bodyMedium,
    fontSize: FontSize.md,
  },
  sectionTitle: {
    color: Colors.text.bright,
    fontFamily: Typography.heading,
    fontSize: FontSize.lg,
    marginBottom: Spacing.sm,
  },
  overview: {
    color: Colors.text.dim,
    fontFamily: Typography.body,
    fontSize: FontSize.md,
    lineHeight: 24,
    marginBottom: Spacing.xs,
  },
  showMore: {
    color: Colors.accent,
    fontFamily: Typography.bodyMedium,
    fontSize: FontSize.sm,
    marginBottom: Spacing.lg,
  },
});
