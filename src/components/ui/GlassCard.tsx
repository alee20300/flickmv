import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { Colors, Radius } from '../../constants/theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: number;
}

export function GlassCard({ children, style, intensity = 20 }: Props) {
  return (
    <BlurView intensity={intensity} tint="dark" style={[styles.card, style]}>
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
});
