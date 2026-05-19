import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { verifyOTP, sendOTP } from '../../src/lib/msgowl';
import { Colors, Typography, FontSize, Spacing, Radius } from '../../src/constants/theme';
import { GradientButton } from '../../src/components/ui/GradientButton';

const OTP_LENGTH = 6;

export default function VerifyScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(60);
  const inputs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const id = setTimeout(() => setResendTimer((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [resendTimer]);

  const handleChange = (text: string, index: number) => {
    const digit = text.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[index] = digit;
    setOtp(next);
    if (digit && index < OTP_LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }
    if (next.every(Boolean)) {
      verify(next.join(''));
    }
  };

  const handleKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !otp[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const verify = async (code: string) => {
    setLoading(true);
    const result = await verifyOTP(phone!, code);

    if (result.error || !result.token_hash) {
      setLoading(false);
      Alert.alert('Invalid Code', result.error ?? 'The code you entered is incorrect.');
      setOtp(Array(OTP_LENGTH).fill(''));
      inputs.current[0]?.focus();
      return;
    }

    const { error } = await supabase.auth.verifyOtp({
      token_hash: result.token_hash,
      type: 'magiclink',
    });
    setLoading(false);

    if (error) {
      Alert.alert('Sign-in failed', error.message);
      setOtp(Array(OTP_LENGTH).fill(''));
      inputs.current[0]?.focus();
      return;
    }

    router.replace('/');
  };

  const resend = async () => {
    const result = await sendOTP(phone!);
    if (!result.error) setResendTimer(60);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.bg.primary }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View
        style={[
          styles.container,
          { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl },
        ]}
      >
        <LinearGradient colors={[Colors.accentPink + '22', 'transparent']} style={styles.bgGlow} />

        <Pressable style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        <Text style={styles.title}>Enter{'\n'}the Code</Text>
        <Text style={styles.subtitle}>
          We sent a 6-digit code to{'\n'}
          <Text style={styles.phone}>{phone}</Text>
        </Text>

        <View style={styles.otpRow}>
          {otp.map((digit, i) => (
            <TextInput
              key={i}
              ref={(r) => {
                inputs.current[i] = r;
              }}
              style={[styles.otpBox, digit && styles.otpBoxFilled]}
              value={digit}
              onChangeText={(t) => handleChange(t, i)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, i)}
              keyboardType="number-pad"
              maxLength={1}
              selectTextOnFocus
              caretHidden
            />
          ))}
        </View>

        <GradientButton
          label="Verify"
          onPress={() => verify(otp.join(''))}
          loading={loading}
          disabled={otp.some((d) => !d)}
          style={styles.button}
        />

        <Pressable onPress={resend} disabled={resendTimer > 0}>
          <Text style={[styles.resend, resendTimer > 0 && styles.resendDisabled]}>
            {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend code'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  bgGlow: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
  },
  back: {
    marginBottom: Spacing.xl,
  },
  backText: {
    color: Colors.text.dim,
    fontFamily: Typography.bodyMedium,
    fontSize: FontSize.md,
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
  phone: {
    color: Colors.text.bright,
    fontFamily: Typography.bodySemiBold,
  },
  otpRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
    justifyContent: 'center',
  },
  otpBox: {
    width: 48,
    height: 56,
    borderRadius: Radius.md,
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text.bright,
    fontFamily: Typography.heading,
    fontSize: FontSize.xxl,
    textAlign: 'center',
  },
  otpBoxFilled: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + '11',
  },
  button: {
    alignSelf: 'stretch',
    marginBottom: Spacing.lg,
  },
  resend: {
    color: Colors.accent,
    fontFamily: Typography.bodyMedium,
    fontSize: FontSize.md,
    textAlign: 'center',
  },
  resendDisabled: {
    color: Colors.text.muted,
  },
});
