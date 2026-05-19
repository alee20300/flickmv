import React, { useEffect } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useNotifications, useMarkAllRead } from '../src/hooks/useNotifications';
import { Colors, Typography, FontSize, Spacing, Radius } from '../src/constants/theme';
import type { DbNotification } from '../src/types/database';

const NOTIFICATION_ICONS: Record<string, string> = {
  friend_request: '👋',
  friend_accepted: '🤝',
  watchlist_invite: '📋',
  watchlist_item_added: '🎬',
  badge_earned: '🏆',
  subscription: '⭐',
};

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: notifications } = useNotifications();
  const markAllRead = useMarkAllRead();

  useEffect(() => {
    markAllRead.mutate();
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path
              d="M19 12H5M5 12L12 19M5 12L12 5"
              stroke={Colors.text.dim}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        <View style={{ width: 44 }} />
      </View>

      <FlatList
        data={notifications ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🔔</Text>
            <Text style={styles.emptyText}>No notifications yet</Text>
          </View>
        }
        renderItem={({ item }: { item: DbNotification }) => (
          <View style={[styles.row, !item.read && styles.rowUnread]}>
            <View style={styles.iconWrap}>
              <Text style={styles.icon}>{NOTIFICATION_ICONS[item.type] ?? '📣'}</Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.notifTitle}>{item.title}</Text>
              <Text style={styles.notifBody} numberOfLines={2}>
                {item.body}
              </Text>
              <Text style={styles.notifTime}>{new Date(item.created_at).toLocaleDateString()}</Text>
            </View>
            {!item.read && <View style={styles.unreadDot} />}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: Colors.text.bright,
    fontFamily: Typography.heading,
    fontSize: FontSize.lg,
  },
  listContent: { paddingHorizontal: Spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  rowUnread: {
    backgroundColor: Colors.accent + '08',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.bg.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 20 },
  info: { flex: 1 },
  notifTitle: {
    color: Colors.text.bright,
    fontFamily: Typography.bodySemiBold,
    fontSize: FontSize.md,
    marginBottom: 2,
  },
  notifBody: {
    color: Colors.text.dim,
    fontFamily: Typography.body,
    fontSize: FontSize.sm,
    lineHeight: 18,
    marginBottom: 4,
  },
  notifTime: {
    color: Colors.text.muted,
    fontFamily: Typography.body,
    fontSize: FontSize.xs,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accent,
    marginTop: Spacing.xs,
  },
  empty: {
    alignItems: 'center',
    paddingTop: Spacing.xxl * 2,
    gap: Spacing.md,
  },
  emptyEmoji: { fontSize: 50 },
  emptyText: {
    color: Colors.text.dim,
    fontFamily: Typography.body,
    fontSize: FontSize.md,
  },
});
