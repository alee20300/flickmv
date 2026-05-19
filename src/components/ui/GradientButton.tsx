import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, FontSize, Radius, Spacing } from '../../constants/theme';

interface Props {
  label: string;
  onPress: () => void;
  style?: ViewStyle;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'outline';
}

export function GradientButton({
  label,
  onPress,
  style,
  loading = false,
  disabled = false,
  variant = 'primary',
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [{ opacity: pressed || disabled ? 0.7 : 1 }, style]}
    >
      {variant === 'primary' ? (
        <LinearGradient
          colors={Colors.gradient.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.button}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.label}>{label}</Text>
          )}
        </LinearGradient>
      ) : (
        <LinearGradient
          colors={Colors.gradient.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.outlineBorder}
        >
          <Pressable style={styles.outlineInner} onPress={onPress} disabled={disabled || loading}>
            <Text style={styles.outlineLabel}>{label}</Text>
          </Pressable>
        </LinearGradient>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: '#fff',
    fontFamily: Typography.bodySemiBold,
    fontSize: FontSize.md,
    letterSpacing: 0.3,
  },
  outlineBorder: {
    borderRadius: Radius.pill,
    padding: 1,
  },
  outlineInner: {
    backgroundColor: Colors.bg.primary,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md - 1,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
  },
  outlineLabel: {
    color: Colors.text.bright,
    fontFamily: Typography.bodySemiBold,
    fontSize: FontSize.md,
  },
});
