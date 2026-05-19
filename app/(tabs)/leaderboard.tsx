import React, { useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLeaderboard } from '../../src/hooks/useLeaderboard';
import { useAuthStore } from '../../src/stores/authStore';
import { Avatar } from '../../src/components/ui/Avatar';
import { Colors, Typography, FontSize, Spacing, Radius } from '../../src/constants/theme';
import type { LeaderboardUser } from '../../src/types/app';

export default function LeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<'weekly' | 'monthly'>('weekly');
  const { data, isLoading } = useLeaderboard(period);
  const profile = useAuthStore((s) => s.profile);

  const myRank = data?.find((u) => u.user_id === profile?.id);
  const topThree = data?.slice(0, 3) ?? [];
  const rest = data?.slice(3) ?? [];

  const rankColor = (rank: number) => {
    if (rank === 1) return Colors.gold;
    if (rank === 2) return Colors.silver;
    if (rank === 3) return Colors.bronze;
    return Colors.text.muted;
  };

  const rankEmoji = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Leaderboard</Text>
        <View style={styles.periodRow}>
          {(['weekly', 'monthly'] as const).map((p) => (
            <Pressable
              key={p}
              style={[styles.periodBtn, period === p && styles.periodBtnActive]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodLabel, period === p && styles.periodLabelActive]}>
                {p === 'weekly' ? 'This Week' : 'This Month'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.xl }} />
      ) : (
        <FlatList
          data={rest}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {/* Top 3 podium */}
              {topThree.length > 0 && (
                <View style={styles.podium}>
                  {topThree.map((user) => (
                    <View
                      key={user.user_id}
                      style={[styles.podiumItem, user.rank === 1 && styles.podiumFirst]}
                    >
                      <Text style={styles.podiumEmoji}>{rankEmoji(user.rank)}</Text>
                      <Avatar
                        uri={user.avatar_url}
                        name={user.display_name ?? user.username}
                        size={user.rank === 1 ? 56 : 44}
                      />
                      <Text
                        style={[styles.podiumName, { color: rankColor(user.rank) }]}
                        numberOfLines={1}
                      >
                        {user.username}
                      </Text>
                      <Text style={styles.podiumXp}>{user.xp.toLocaleString()} XP</Text>
                    </View>
                  ))}
                </View>
              )}
              {rest.length > 0 && <Text style={styles.sectionLabel}>Rankings</Text>}
            </>
          }
          renderItem={({ item }: { item: LeaderboardUser }) => (
            <View style={[styles.row, item.user_id === profile?.id && styles.rowHighlight]}>
              <Text style={[styles.rank, { color: rankColor(item.rank) }]}>
                {rankEmoji(item.rank)}
              </Text>
              <Avatar uri={item.avatar_url} name={item.display_name ?? item.username} size={36} />
              <View style={styles.rowInfo}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.display_name ?? item.username}
                  {item.user_id === profile?.id ? ' (You)' : ''}
                </Text>
                <Text style={styles.rowHandle}>@{item.username}</Text>
              </View>
              <Text style={styles.rowXp}>{item.xp.toLocaleString()}</Text>
            </View>
          )}
          ListFooterComponent={
            myRank && myRank.rank > 3 ? (
              <LinearGradient
                colors={[Colors.accent + '22', Colors.accentPink + '11']}
                style={styles.myRankCard}
              >
                <Text style={styles.myRankLabel}>Your Rank</Text>
                <View style={styles.myRankRow}>
                  <Text style={styles.myRankNum}>#{myRank.rank}</Text>
                  <Text style={styles.myRankXp}>{myRank.xp.toLocaleString()} XP</Text>
                </View>
              </LinearGradient>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyEmoji}>🏆</Text>
              <Text style={styles.emptyText}>No rankings yet. Earn XP to appear here!</Text>
            </View>
          }
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
    gap: Spacing.md,
  },
  title: {
    color: Colors.text.bright,
    fontFamily: Typography.heading,
    fontSize: FontSize.xxl,
    letterSpacing: -0.5,
  },
  periodRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  periodBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  periodBtnActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  periodLabel: {
    color: Colors.text.dim,
    fontFamily: Typography.bodyMedium,
    fontSize: FontSize.sm,
  },
  periodLabelActive: {
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: Spacing.md,
  },
  podium: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: Spacing.md,
    marginVertical: Spacing.xl,
    paddingHorizontal: Spacing.sm,
  },
  podiumItem: {
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
  },
  podiumFirst: {
    transform: [{ translateY: -12 }],
  },
  podiumEmoji: { fontSize: 24 },
  podiumName: {
    fontFamily: Typography.bodySemiBold,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  podiumXp: {
    color: Colors.text.muted,
    fontFamily: Typography.body,
    fontSize: FontSize.xs,
  },
  sectionLabel: {
    color: Colors.text.dim,
    fontFamily: Typography.bodyMedium,
    fontSize: FontSize.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  rowHighlight: {
    backgroundColor: Colors.accent + '11',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: 0,
    marginBottom: 1,
  },
  rank: {
    width: 36,
    fontFamily: Typography.bodySemiBold,
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  rowInfo: { flex: 1 },
  rowName: {
    color: Colors.text.bright,
    fontFamily: Typography.bodySemiBold,
    fontSize: FontSize.md,
  },
  rowHandle: {
    color: Colors.text.muted,
    fontFamily: Typography.body,
    fontSize: FontSize.sm,
  },
  rowXp: {
    color: Colors.accent,
    fontFamily: Typography.bodySemiBold,
    fontSize: FontSize.sm,
  },
  myRankCard: {
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.accent + '33',
  },
  myRankLabel: {
    color: Colors.text.dim,
    fontFamily: Typography.bodyMedium,
    fontSize: FontSize.sm,
    marginBottom: Spacing.xs,
  },
  myRankRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  myRankNum: {
    color: Colors.text.bright,
    fontFamily: Typography.heading,
    fontSize: FontSize.xxl,
  },
  myRankXp: {
    color: Colors.accent,
    fontFamily: Typography.bodySemiBold,
    fontSize: FontSize.lg,
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
  },
});
