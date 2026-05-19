import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import BottomSheet, { BottomSheetView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { useSearch } from '../../hooks/useSearch';
import { useAddWatchlistItem } from '../../hooks/useWatchlistDetail';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import { posterUrl, mediaTitle, mediaYear } from '../../lib/tmdb';
import { Colors, Typography, FontSize, Spacing, Radius } from '../../constants/theme';
import type { TMDBMediaItem } from '../../types/tmdb';

interface Props {
  watchlistId: string;
  onClose: () => void;
}

export function AddTitleSheet({ watchlistId, onClose }: Props) {
  const sheetRef = useRef<BottomSheet>(null);
  const [query, setQuery] = useState('');
  const { data, isLoading } = useSearch(query);
  const addItem = useAddWatchlistItem(watchlistId);
  const userId = useAuthStore((s) => s.profile?.id);

  const results = (data?.results ?? []).filter(
    (item): item is TMDBMediaItem => item.media_type === 'movie' || item.media_type === 'tv',
  );

  const handleAdd = async (item: TMDBMediaItem) => {
    try {
      await addItem.mutateAsync({
        tmdb_id: item.id,
        media_type: item.media_type as 'movie' | 'tv',
        title: mediaTitle(item),
        poster_path: item.poster_path,
        backdrop_path: item.backdrop_path,
        overview: item.overview,
        release_date: item.release_date ?? item.first_air_date ?? null,
        vote_average: item.vote_average,
      });

      if (userId) {
        await supabase.rpc('award_xp', {
          p_user_id: userId,
          p_amount: 10,
          p_reason: 'add_to_watchlist',
        });
        await supabase.from('activity_feed').insert({
          actor_id: userId,
          type: 'added_to_watchlist',
          tmdb_id: item.id,
          media_type: item.media_type,
          media_title: mediaTitle(item),
          poster_path: item.poster_path,
          watchlist_id: watchlistId,
        });
      }
    } catch (e: any) {
      if (e.message === 'Already in watchlist') {
        Alert.alert('Already Added', 'This title is already in your watchlist.');
      } else {
        Alert.alert('Error', e.message);
      }
    }
  };

  return (
    <BottomSheet
      ref={sheetRef}
      snapPoints={['70%', '90%']}
      enablePanDownToClose
      onClose={onClose}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetView style={styles.container}>
        <Text style={styles.title}>Add Title</Text>
        <BottomSheetTextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search movies or TV shows..."
          placeholderTextColor={Colors.text.muted}
        />
        {isLoading && <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.md }} />}
        <FlatList
          data={results}
          keyExtractor={(item) => `search-${item.id}`}
          renderItem={({ item }) => {
            const poster = item.poster_path ? posterUrl(item.poster_path, 'w185') : null;
            return (
              <Pressable style={styles.resultRow} onPress={() => handleAdd(item)}>
                {poster ? (
                  <Image source={{ uri: poster }} style={styles.resultPoster} contentFit="cover" />
                ) : (
                  <View style={[styles.resultPoster, styles.posterPlaceholder]} />
                )}
                <View style={styles.resultInfo}>
                  <Text style={styles.resultTitle} numberOfLines={2}>
                    {mediaTitle(item)}
                  </Text>
                  <Text style={styles.resultMeta}>
                    {item.media_type === 'tv' ? 'TV' : 'Movie'}
                    {mediaYear(item) ? ` · ${mediaYear(item)}` : ''}
                  </Text>
                </View>
                <View style={styles.addBtn}>
                  <Text style={styles.addBtnText}>+</Text>
                </View>
              </Pressable>
            );
          }}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        />
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: Colors.bg.secondary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handle: {
    backgroundColor: Colors.border,
    width: 40,
  },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  title: {
    color: Colors.text.bright,
    fontFamily: Typography.heading,
    fontSize: FontSize.xl,
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  searchInput: {
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    color: Colors.text.bright,
    fontFamily: Typography.bodyMedium,
    fontSize: FontSize.md,
    marginBottom: Spacing.md,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  resultPoster: {
    width: 36,
    height: 54,
    borderRadius: Radius.xs,
  },
  posterPlaceholder: {
    backgroundColor: Colors.bg.elevated,
  },
  resultInfo: {
    flex: 1,
  },
  resultTitle: {
    color: Colors.text.bright,
    fontFamily: Typography.bodyMedium,
    fontSize: FontSize.sm,
    marginBottom: 2,
  },
  resultMeta: {
    color: Colors.text.dim,
    fontFamily: Typography.body,
    fontSize: FontSize.xs,
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    color: '#fff',
    fontSize: 20,
    fontFamily: Typography.heading,
    lineHeight: 24,
  },
});
