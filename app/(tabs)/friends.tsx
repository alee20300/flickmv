import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
  useFriends,
  usePendingRequests,
  useSendFriendRequest,
  useRespondToFriendRequest,
  useSearchUsers,
} from '../../src/hooks/useFriends';
import { useActivityFeed } from '../../src/hooks/useActivityFeed';
import { Avatar } from '../../src/components/ui/Avatar';
import { posterUrl } from '../../src/lib/tmdb';
import { Colors, Typography, FontSize, Spacing, Radius } from '../../src/constants/theme';

type Tab = 'feed' | 'friends';

export default function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('feed');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: friends } = useFriends();
  const { data: pendingRequests } = usePendingRequests();
  const { data: feedData, isLoading: feedLoading, fetchNextPage, hasNextPage } = useActivityFeed();
  const { data: searchResults } = useSearchUsers(searchQuery);
  const sendRequest = useSendFriendRequest();
  const respondToRequest = useRespondToFriendRequest();

  const feedItems = feedData?.pages.flat() ?? [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Friends</Text>
      </View>

      {/* Tab switcher */}
      <View style={styles.tabRow}>
        {(['feed', 'friends'] as Tab[]).map((t) => (
          <Pressable
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
              {t === 'feed'
                ? 'Activity'
                : `Friends${friends?.length ? ` (${friends.length})` : ''}`}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'feed' ? (
        <FlatList
          data={feedItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
          onEndReached={() => hasNextPage && fetchNextPage()}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            feedLoading ? (
              <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.xl }} />
            ) : (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No activity yet. Add some friends!</Text>
              </View>
            )
          }
          renderItem={({ item }) => {
            const actor = item.actor as unknown as
              | { username: string; avatar_url: string | null }
              | undefined;
            const poster = item.poster_path ? posterUrl(item.poster_path, 'w185') : null;
            return (
              <View style={styles.feedRow}>
                <Avatar uri={actor?.avatar_url} name={actor?.username} size={40} />
                {poster && (
                  <Image source={{ uri: poster }} style={styles.feedPoster} contentFit="cover" />
                )}
                <View style={styles.feedInfo}>
                  <Text style={styles.feedActor}>{actor?.username ?? 'Unknown'}</Text>
                  <Text style={styles.feedAction} numberOfLines={2}>
                    {item.type === 'added_to_watchlist' &&
                      `added "${item.media_title}" to ${item.watchlist_title ?? 'a list'}`}
                    {item.type === 'watched' && `watched "${item.media_title}"`}
                    {item.type === 'created_watchlist' &&
                      `created watchlist "${item.watchlist_title}"`}
                    {item.type === 'became_friends' && 'joined FlickMV'}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      ) : (
        <FlatList
          data={[]}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {/* Search */}
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search by username..."
                placeholderTextColor={Colors.text.muted}
              />

              {/* Search results */}
              {searchQuery.length > 1 &&
                (searchResults ?? []).map((user: any) => (
                  <View key={user.id} style={styles.userRow}>
                    <Avatar uri={user.avatar_url} name={user.username} size={40} />
                    <View style={styles.userInfo}>
                      <Text style={styles.userName}>{user.display_name ?? user.username}</Text>
                      <Text style={styles.userHandle}>@{user.username}</Text>
                    </View>
                    <Pressable
                      style={styles.addBtn}
                      onPress={() => {
                        sendRequest.mutate(user.id, {
                          onSuccess: () =>
                            Alert.alert('Request Sent', `Friend request sent to @${user.username}`),
                          onError: (e: any) => Alert.alert('Error', e.message),
                        });
                      }}
                    >
                      <Text style={styles.addBtnText}>+ Add</Text>
                    </Pressable>
                  </View>
                ))}

              {/* Pending requests */}
              {(pendingRequests ?? []).length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Friend Requests</Text>
                  {(pendingRequests ?? []).map((req: any) => (
                    <View key={req.id} style={styles.requestRow}>
                      <Avatar
                        uri={req.requester?.avatar_url}
                        name={req.requester?.username}
                        size={40}
                      />
                      <View style={styles.userInfo}>
                        <Text style={styles.userName}>{req.requester?.username}</Text>
                        <Text style={styles.userHandle}>wants to be friends</Text>
                      </View>
                      <View style={styles.requestActions}>
                        <Pressable
                          style={styles.acceptBtn}
                          onPress={() =>
                            respondToRequest.mutate({
                              friendshipId: req.id,
                              accept: true,
                              requesterId: req.requester_id,
                            })
                          }
                        >
                          <Text style={styles.acceptText}>✓</Text>
                        </Pressable>
                        <Pressable
                          style={styles.rejectBtn}
                          onPress={() =>
                            respondToRequest.mutate({
                              friendshipId: req.id,
                              accept: false,
                              requesterId: req.requester_id,
                            })
                          }
                        >
                          <Text style={styles.rejectText}>✗</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </>
              )}

              {/* Friends list */}
              {(friends ?? []).length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>My Friends ({friends!.length})</Text>
                  {friends!.map((f) => (
                    <Pressable
                      key={f.id}
                      style={styles.userRow}
                      onPress={() =>
                        router.push({ pathname: '/user/[id]', params: { id: f.user.id } })
                      }
                    >
                      <Avatar uri={f.user.avatar_url} name={f.user.username} size={40} />
                      <View style={styles.userInfo}>
                        <Text style={styles.userName}>
                          {f.user.display_name ?? f.user.username}
                        </Text>
                        <Text style={styles.userHandle}>
                          @{f.user.username} · {f.user.xp_total} XP
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </>
              )}

              {searchQuery.length <= 1 &&
                (friends ?? []).length === 0 &&
                (pendingRequests ?? []).length === 0 && (
                  <View style={styles.emptyWrap}>
                    <Text style={styles.emptyEmoji}>👥</Text>
                    <Text style={styles.emptyText}>Search for friends by username to connect!</Text>
                  </View>
                )}
            </>
          }
          renderItem={() => null}
          keyExtractor={() => 'list-header'}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  header: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  title: {
    color: Colors.text.bright,
    fontFamily: Typography.heading,
    fontSize: FontSize.xxl,
    letterSpacing: -0.5,
  },
  tabRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  tabBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabBtnActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  tabLabel: {
    color: Colors.text.dim,
    fontFamily: Typography.bodyMedium,
    fontSize: FontSize.sm,
  },
  tabLabelActive: {
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: Spacing.md,
  },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  feedPoster: {
    width: 32,
    height: 48,
    borderRadius: Radius.xs,
  },
  feedInfo: { flex: 1 },
  feedActor: {
    color: Colors.text.bright,
    fontFamily: Typography.bodySemiBold,
    fontSize: FontSize.sm,
    marginBottom: 2,
  },
  feedAction: {
    color: Colors.text.dim,
    fontFamily: Typography.body,
    fontSize: FontSize.sm,
    lineHeight: 18,
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
  sectionLabel: {
    color: Colors.text.dim,
    fontFamily: Typography.bodyMedium,
    fontSize: FontSize.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  userInfo: { flex: 1 },
  userName: {
    color: Colors.text.bright,
    fontFamily: Typography.bodySemiBold,
    fontSize: FontSize.md,
  },
  userHandle: {
    color: Colors.text.dim,
    fontFamily: Typography.body,
    fontSize: FontSize.sm,
  },
  addBtn: {
    backgroundColor: Colors.accent + '22',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  addBtnText: {
    color: Colors.accent,
    fontFamily: Typography.bodySemiBold,
    fontSize: FontSize.sm,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  requestActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  acceptBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: Typography.bodyBold,
  },
  rejectBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.error + '22',
    borderWidth: 1,
    borderColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectText: {
    color: Colors.error,
    fontSize: 16,
    fontFamily: Typography.bodyBold,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingTop: Spacing.xxl,
    gap: Spacing.md,
  },
  emptyEmoji: { fontSize: 50 },
  emptyText: {
    color: Colors.text.dim,
    fontFamily: Typography.body,
    fontSize: FontSize.md,
    textAlign: 'center',
    maxWidth: 260,
  },
});
