import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { Colors, Typography, FontSize, Spacing } from '../../constants/theme';

interface Props<T> {
  title: string;
  data: T[];
  renderItem: ({ item, index }: { item: T; index: number }) => React.ReactElement;
  keyExtractor: (item: T, index: number) => string;
  onSeeAll?: () => void;
  loading?: boolean;
  loadingPlaceholder?: React.ReactElement;
  itemWidth?: number;
}

export function MediaRow<T>({
  title,
  data,
  renderItem,
  keyExtractor,
  onSeeAll,
  loading,
  loadingPlaceholder,
}: Props<T>) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {onSeeAll && (
          <Pressable onPress={onSeeAll}>
            <Text style={styles.seeAll}>See all</Text>
          </Pressable>
        )}
      </View>
      {loading && loadingPlaceholder ? (
        <View style={styles.loadingRow}>{loadingPlaceholder}</View>
      ) : (
        <FlatList
          data={data}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ width: Spacing.sm }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  title: {
    color: Colors.text.bright,
    fontFamily: Typography.heading,
    fontSize: FontSize.lg,
  },
  seeAll: {
    color: Colors.accent,
    fontFamily: Typography.bodyMedium,
    fontSize: FontSize.sm,
  },
  listContent: {
    paddingHorizontal: Spacing.md,
  },
  loadingRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
});
