import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, FontSize, Radius, Spacing } from '../../constants/theme';

interface Props {
  label: string;
  variant?: 'gradient' | 'subtle' | 'outline' | 'gold' | 'silver';
  style?: ViewStyle;
}

export function PillBadge({ label, variant = 'subtle', style }: Props) {
  if (variant === 'gradient') {
    return (
      <LinearGradient
        colors={Colors.gradient.primary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.pill, style]}
      >
        <Text style={styles.labelGradient}>{label}</Text>
      </LinearGradient>
    );
  }

  return (
    <View
      style={[
        styles.pill,
        variant === 'outline' && styles.outline,
        variant === 'subtle' && styles.subtle,
        variant === 'gold' && styles.gold,
        variant === 'silver' && styles.silver,
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          variant === 'gold' && styles.goldText,
          variant === 'silver' && styles.silverText,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
    alignSelf: 'flex-start',
  },
  label: {
    fontFamily: Typography.bodySemiBold,
    fontSize: FontSize.xs,
    color: Colors.text.dim,
  },
  labelGradient: {
    fontFamily: Typography.bodySemiBold,
    fontSize: FontSize.xs,
    color: '#fff',
  },
  outline: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
  subtle: {
    backgroundColor: Colors.bg.elevated,
  },
  gold: {
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  goldText: {
    color: Colors.gold,
  },
  silver: {
    backgroundColor: 'rgba(148,163,184,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.3)',
  },
  silverText: {
    color: Colors.silver,
  },
});
