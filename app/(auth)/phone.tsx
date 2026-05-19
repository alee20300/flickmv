import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sendOTP } from '../../src/lib/msgowl';
import { Colors, Typography, FontSize, Spacing, Radius } from '../../src/constants/theme';
import { GradientButton } from '../../src/components/ui/GradientButton';

const DIAL_CODES = [
  { code: '+1', country: '🇺🇸 US' },
  { code: '+44', country: '🇬🇧 UK' },
  { code: '+60', country: '🇲🇾 MY' },
  { code: '+960', country: '🇲🇻 MV' },
  { code: '+91', country: '🇮🇳 IN' },
  { code: '+971', country: '🇦🇪 UAE' },
  { code: '+61', country: '🇦🇺 AU' },
  { code: '+65', country: '🇸🇬 SG' },
];

export default function PhoneScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [dialCode, setDialCode] = useState('+960');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const fullPhone = `${dialCode}${phone.replace(/\s/g, '')}`;

  const handleSend = async () => {
    if (phone.length < 7) {
      Alert.alert('Invalid number', 'Please enter a valid phone number.');
      return;
    }
    setLoading(true);
    const result = await sendOTP(fullPhone);
    setLoading(false);
    if (result.error) {
      Alert.alert('Error', result.error);
    } else {
      router.push({ pathname: '/(auth)/verify', params: { phone: fullPhone } });
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.bg.primary }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient colors={[Colors.accent + '22', 'transparent']} style={styles.bgGlow} />

        <Text style={styles.title}>Welcome to{'\n'}FlickMV</Text>
        <Text style={styles.subtitle}>Enter your phone number to get started.</Text>

        <View style={styles.inputRow}>
          <Pressable style={styles.dialButton} onPress={() => setShowPicker(!showPicker)}>
            <Text style={styles.dialText}>{dialCode}</Text>
            <Text style={styles.chevron}>▾</Text>
          </Pressable>
          <TextInput
            style={styles.phoneInput}
            value={phone}
            onChangeText={setPhone}
            placeholder="7XXXXXXX"
            placeholderTextColor={Colors.text.muted}
            keyboardType="phone-pad"
            maxLength={15}
            returnKeyType="done"
            onSubmitEditing={handleSend}
          />
        </View>

        {showPicker && (
          <View style={styles.picker}>
            {DIAL_CODES.map((item) => (
              <Pressable
                key={item.code}
                style={[styles.pickerItem, dialCode === item.code && styles.pickerItemActive]}
                onPress={() => {
                  setDialCode(item.code);
                  setShowPicker(false);
                }}
              >
                <Text style={styles.pickerText}>{item.country}</Text>
                <Text style={styles.pickerCode}>{item.code}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <GradientButton
          label="Send Code"
          onPress={handleSend}
          loading={loading}
          style={styles.button}
        />

        <Text style={styles.disclaimer}>
          We&apos;ll send you a one-time SMS code. Standard message rates may apply.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
  },
  bgGlow: {
    position: 'absolute',
    top: -100,
    left: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
  },
  title: {
    color: Colors.text.bright,
    fontFamily: Typography.heading,
    fontSize: FontSize.display,
    lineHeight: FontSize.display * 1.1,
    letterSpacing: -1,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    color: Colors.text.dim,
    fontFamily: Typography.body,
    fontSize: FontSize.lg,
    marginBottom: Spacing.xxl,
    lineHeight: 26,
  },
  inputRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  dialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.xs,
  },
  dialText: {
    color: Colors.text.bright,
    fontFamily: Typography.bodyMedium,
    fontSize: FontSize.md,
  },
  chevron: {
    color: Colors.text.muted,
    fontSize: 10,
  },
  phoneInput: {
    flex: 1,
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    color: Colors.text.bright,
    fontFamily: Typography.bodyMedium,
    fontSize: FontSize.lg,
    letterSpacing: 1,
  },
  picker: {
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  pickerItemActive: {
    backgroundColor: Colors.accent + '22',
  },
  pickerText: {
    color: Colors.text.bright,
    fontFamily: Typography.bodyMedium,
    fontSize: FontSize.md,
  },
  pickerCode: {
    color: Colors.text.dim,
    fontFamily: Typography.body,
    fontSize: FontSize.sm,
  },
  button: {
    marginTop: Spacing.md,
    alignSelf: 'stretch',
  },
  disclaimer: {
    color: Colors.text.muted,
    fontFamily: Typography.body,
    fontSize: FontSize.sm,
    textAlign: 'center',
    marginTop: Spacing.lg,
    lineHeight: 20,
  },
});
