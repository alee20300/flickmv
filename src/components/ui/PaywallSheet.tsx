import React, { useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import { useUIStore } from '../../stores/uiStore';
import { Colors, Typography, FontSize, Spacing, Radius } from '../../constants/theme';

const FEATURES = [
  { icon: '📋', label: 'Up to 20 watchlists (vs 3 free)' },
  { icon: '👥', label: 'Collaborative watchlists' },
  { icon: '🔒', label: 'Private watchlists' },
  { icon: '🏆', label: 'Full leaderboard access' },
  { icon: '⚡', label: '1.5× XP multiplier' },
  { icon: '⭐', label: 'Premium badge on profile' },
];

export function PaywallSheet() {
  const sheetRef = useRef<BottomSheet>(null);
  const { paywallVisible, paywallFeature, hidePaywall } = useUIStore();

  if (!paywallVisible) return null;

  return (
    <BottomSheet
      ref={sheetRef}
      snapPoints={['75%']}
      enablePanDownToClose
      onClose={hidePaywall}
      backgroundStyle={styles.sheetBg}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetView style={styles.container}>
        <LinearGradient
          colors={[Colors.accent + '33', Colors.accentPink + '22', 'transparent']}
          style={styles.glow}
        />
        <Text style={styles.emoji}>⭐</Text>
        <Text style={styles.title}>Upgrade to Premium</Text>
        {paywallFeature && (
          <Text style={styles.subtitle}>
            <Text style={styles.featureHighlight}>{paywallFeature}</Text> requires a Premium
            subscription.
          </Text>
        )}

        <View style={styles.featureList}>
          {FEATURES.map((f) => (
            <View key={f.label} style={styles.featureRow}>
              <Text style={styles.featureIcon}>{f.icon}</Text>
              <Text style={styles.featureLabel}>{f.label}</Text>
            </View>
          ))}
        </View>

        <Pressable
          onPress={() => {
            hidePaywall();
            Linking.openURL('https://flickmv.app/upgrade');
          }}
        >
          <LinearGradient
            colors={Colors.gradient.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.upgradeBtn}
          >
            <Text style={styles.upgradeBtnText}>Upgrade Now →</Text>
          </LinearGradient>
        </Pressable>

        <Pressable onPress={hidePaywall} style={styles.notNow}>
          <Text style={styles.notNowText}>Not now</Text>
        </Pressable>
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
  handle: { backgroundColor: Colors.border, width: 40 },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },
  glow: {
    position: 'absolute',
    top: -60,
    left: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  emoji: { fontSize: 48, marginBottom: Spacing.md },
  title: {
    color: Colors.text.bright,
    fontFamily: Typography.heading,
    fontSize: FontSize.xxl,
    letterSpacing: -0.5,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    color: Colors.text.dim,
    fontFamily: Typography.body,
    fontSize: FontSize.md,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  featureHighlight: {
    color: Colors.text.bright,
    fontFamily: Typography.bodySemiBold,
  },
  featureList: {
    alignSelf: 'stretch',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  featureIcon: { fontSize: 18, width: 24, textAlign: 'center' },
  featureLabel: {
    color: Colors.text.dim,
    fontFamily: Typography.bodyMedium,
    fontSize: FontSize.md,
  },
  upgradeBtn: {
    alignSelf: 'stretch',
    paddingVertical: Spacing.md,
    borderRadius: Radius.pill,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  upgradeBtnText: {
    color: '#fff',
    fontFamily: Typography.bodySemiBold,
    fontSize: FontSize.lg,
  },
  notNow: { paddingVertical: Spacing.sm },
  notNowText: {
    color: Colors.text.muted,
    fontFamily: Typography.body,
    fontSize: FontSize.md,
  },
});
