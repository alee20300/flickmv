import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { Colors, Typography, FontSize } from '../../constants/theme';

const ICONS: Record<string, (active: boolean) => React.ReactElement> = {
  index: (active) => (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1v-9z"
        stroke={active ? '#fff' : Colors.text.muted}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </Svg>
  ),
  watchlists: (active) => (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Rect
        x={3}
        y={4}
        width={18}
        height={3}
        rx={1}
        stroke={active ? '#fff' : Colors.text.muted}
        strokeWidth={1.6}
      />
      <Rect
        x={3}
        y={10.5}
        width={18}
        height={3}
        rx={1}
        stroke={active ? '#fff' : Colors.text.muted}
        strokeWidth={1.6}
      />
      <Rect
        x={3}
        y={17}
        width={11}
        height={3}
        rx={1}
        stroke={active ? '#fff' : Colors.text.muted}
        strokeWidth={1.6}
      />
    </Svg>
  ),
  friends: (active) => (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle
        cx={9}
        cy={8}
        r={3.5}
        stroke={active ? '#fff' : Colors.text.muted}
        strokeWidth={1.6}
      />
      <Circle
        cx={17}
        cy={9}
        r={2.5}
        stroke={active ? '#fff' : Colors.text.muted}
        strokeWidth={1.6}
      />
      <Path
        d="M3 19c.6-2.8 3-4.5 6-4.5s5.4 1.7 6 4.5"
        stroke={active ? '#fff' : Colors.text.muted}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
      <Path
        d="M15 16.5c.6-1.2 1.6-1.8 2.8-1.8 1.4 0 2.5.8 3 2"
        stroke={active ? '#fff' : Colors.text.muted}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </Svg>
  ),
  leaderboard: (active) => (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 4h10v4a5 5 0 11-10 0V4z"
        stroke={active ? '#fff' : Colors.text.muted}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <Path
        d="M7 6H4v2a3 3 0 003 3M17 6h3v2a3 3 0 01-3 3"
        stroke={active ? '#fff' : Colors.text.muted}
        strokeWidth={1.6}
      />
      <Path
        d="M10 13h4v4l2 3H8l2-3v-4z"
        stroke={active ? '#fff' : Colors.text.muted}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </Svg>
  ),
  profile: (active) => (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={8} r={4} stroke={active ? '#fff' : Colors.text.muted} strokeWidth={1.6} />
      <Path
        d="M4 20c1-3.6 4-5.5 8-5.5s7 1.9 8 5.5"
        stroke={active ? '#fff' : Colors.text.muted}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </Svg>
  ),
};

const TAB_LABELS: Record<string, string> = {
  index: 'Home',
  watchlists: 'Watchlists',
  friends: 'Friends',
  leaderboard: 'Leaderboard',
  profile: 'Profile',
};

function TabItem({
  route,
  active,
  onPress,
}: {
  route: string;
  active: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      style={styles.tabItem}
      onPress={() => {
        scale.value = withSpring(0.82, { duration: 80 }, () => {
          scale.value = withSpring(1, { duration: 140 });
        });
        onPress();
      }}
    >
      <Animated.View style={[styles.iconWrap, animStyle]}>
        {/* purple dot above active icon */}
        {active && <View style={styles.activeDot} />}
        {ICONS[route]?.(active) ?? null}
      </Animated.View>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
        {TAB_LABELS[route] ?? route}
      </Text>
    </Pressable>
  );
}

export function TabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrapper, { bottom: Math.max(insets.bottom, 14) }]}>
      <BlurView intensity={28} tint="dark" style={styles.container}>
        <View style={styles.border} />
        <View style={styles.tabs}>
          {state.routes.map((route, index) => {
            const active = state.index === index;
            return (
              <TabItem
                key={route.key}
                route={route.name}
                active={active}
                onPress={() => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!active && !event.defaultPrevented) {
                    navigation.navigate(route.name);
                  }
                }}
              />
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 12,
    right: 12,
    borderRadius: 28,
    overflow: 'hidden',
    // shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 16,
  },
  container: {
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: 'rgba(10,10,14,0.72)',
  },
  border: {
    height: 0.5,
    backgroundColor: Colors.borderStrong,
  },
  tabs: {
    flexDirection: 'row',
    height: 64,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: '100%',
  },
  iconWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  activeDot: {
    position: 'absolute',
    top: -8,
    left: '50%',
    marginLeft: -2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.accent,
    // glow
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: Typography.bodyMedium,
    color: Colors.text.muted,
    letterSpacing: 0.2,
  },
  tabLabelActive: {
    color: '#ffffff',
  },
});
