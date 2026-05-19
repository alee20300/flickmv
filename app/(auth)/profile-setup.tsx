import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { useAuthStore } from '../../src/stores/authStore';
import { TMDB_GENRES } from '../../src/constants/config';
import { Colors, Typography, FontSize, Spacing, Radius } from '../../src/constants/theme';
import { GradientButton } from '../../src/components/ui/GradientButton';

export default function ProfileSetup() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, fetchProfile } = useAuthStore();

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [usernameError, setUsernameError] = useState('');

  const toggleGenre = (id: number) => {
    setSelectedGenres((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  };

  const checkUsername = async (val: string) => {
    setUsername(val);
    setUsernameError('');
    if (val.length < 3) return;
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('username', val.toLowerCase())
      .single();
    if (data) setUsernameError('Username already taken');
  };

  const handleSave = async () => {
    if (!username || username.length < 3) {
      Alert.alert('Username too short', 'Username must be at least 3 characters.');
      return;
    }
    if (usernameError) return;
    if (!session?.user) return;

    setLoading(true);
    const { error } = await supabase
      .from('users')
      .update({
        username: username.toLowerCase(),
        display_name: displayName || username,
        favorite_genres: selectedGenres,
        onboarding_completed: true,
      })
      .eq('id', session.user.id);

    if (error) {
      setLoading(false);
      Alert.alert('Error', error.message);
      return;
    }

    await supabase.rpc('award_xp', {
      p_user_id: session.user.id,
      p_amount: 100,
      p_reason: 'onboarding',
    });

    await fetchProfile(session.user.id);
    setLoading(false);
    router.replace('/(tabs)');
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

        <Text style={styles.title}>Set Up{'\n'}Your Profile</Text>
        <Text style={styles.subtitle}>
          Tell us a bit about yourself to personalize your experience.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Username *</Text>
          <TextInput
            style={[styles.input, usernameError ? styles.inputError : null]}
            value={username}
            onChangeText={checkUsername}
            placeholder="flickfan"
            placeholderTextColor={Colors.text.muted}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={24}
          />
          {usernameError ? <Text style={styles.error}>{usernameError}</Text> : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Display Name</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your name"
            placeholderTextColor={Colors.text.muted}
            maxLength={32}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Favourite Genres (optional)</Text>
          <Text style={styles.labelHint}>Select at least one for personalized recommendations</Text>
          <View style={styles.genreGrid}>
            {TMDB_GENRES.map((g) => {
              const active = selectedGenres.includes(g.id);
              return (
                <Pressable
                  key={g.id}
                  onPress={() => toggleGenre(g.id)}
                  style={styles.genreChipWrapper}
                >
                  {active ? (
                    <LinearGradient
                      colors={Colors.gradient.primary}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.genreChip}
                    >
                      <Text style={styles.genreTextActive}>{g.name}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={styles.genreChipInactive}>
                      <Text style={styles.genreText}>{g.name}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        <GradientButton
          label={loading ? 'Saving...' : 'Get Started →'}
          onPress={handleSave}
          loading={loading}
          disabled={!!usernameError || username.length < 3}
          style={styles.button}
        />
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
    top: -80,
    right: -80,
    width: 250,
    height: 250,
    borderRadius: 125,
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
    marginBottom: Spacing.xl,
    lineHeight: 26,
  },
  field: {
    marginBottom: Spacing.lg,
  },
  label: {
    color: Colors.text.dim,
    fontFamily: Typography.bodyMedium,
    fontSize: FontSize.sm,
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  labelHint: {
    color: Colors.text.muted,
    fontFamily: Typography.body,
    fontSize: FontSize.sm,
    marginBottom: Spacing.md,
  },
  input: {
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    color: Colors.text.bright,
    fontFamily: Typography.bodyMedium,
    fontSize: FontSize.md,
  },
  inputError: {
    borderColor: Colors.error,
  },
  error: {
    color: Colors.error,
    fontFamily: Typography.body,
    fontSize: FontSize.sm,
    marginTop: Spacing.xs,
  },
  genreGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  genreChipWrapper: {},
  genreChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
  },
  genreChipInactive: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  genreText: {
    color: Colors.text.dim,
    fontFamily: Typography.bodyMedium,
    fontSize: FontSize.sm,
  },
  genreTextActive: {
    color: '#fff',
    fontFamily: Typography.bodySemiBold,
    fontSize: FontSize.sm,
  },
  button: {
    alignSelf: 'stretch',
    marginTop: Spacing.md,
  },
});
