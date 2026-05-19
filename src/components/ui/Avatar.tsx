import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Colors, Typography, FontSize } from '../../constants/theme';

interface Props {
  uri?: string | null;
  name?: string | null;
  size?: number;
  style?: ViewStyle;
}

export function Avatar({ uri, name, size = 40, style }: Props) {
  const initials = name
    ? name
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
    : '?';

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
      />
    );
  }

  return (
    <View
      style={[styles.placeholder, { width: size, height: size, borderRadius: size / 2 }, style]}
    >
      <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: Colors.bg.elevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: Colors.text.dim,
    fontFamily: Typography.bodySemiBold,
  },
});
