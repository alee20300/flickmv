import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCreateWatchlist } from '../../src/hooks/useWatchlists';
import { useAuthStore } from '../../src/stores/authStore';
import { useUIStore } from '../../src/stores/uiStore';
import { GATES } from '../../src/constants/config';
import { Colors, Typography, FontSize, Spacing, Radius } from '../../src/constants/theme';
import { GradientButton } from '../../src/components/ui/GradientButton';
import type { VisibilityType } from '../../src/types/database';

const VISIBILITY_OPTIONS: { value: VisibilityType; label: string; icon: string }[] = [
  { value: 'public', label: 'Public', icon: '🌐' },
  { value: 'friends', label: 'Friends', icon: '👥' },
  { value: 'private', label: 'Private', icon: '🔒' },
];

export default function CreateWatchlist() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const createWatchlist = useCreateWatchlist();
  const profile = useAuthStore((s) => s.profile);
  const showPaywall = useUIStore((s) => s.showPaywall);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<VisibilityType>('private');
  const [isCollaborative, setIsCollaborative] = useState(false);

  const tier = profile?.subscription_tier ?? 'free';

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('Title required', 'Please give your watchlist a name.');
      return;
    }
    if (isCollaborative && GATES.maxCollaborativeWatchlists[tier] === 0) {
      showPaywall('Collaborative watchlists');
      return;
    }
    if (visibility === 'private' && !GATES.canHavePrivateWatchlists[tier]) {
      showPaywall('Private watchlists');
      return;
    }

    try {
      const result = await createWatchlist.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        visibility,
        is_collaborative: isCollaborative,
      });
      router.replace({ pathname: '/watchlist/[id]', params: { id: result.id } });
    } catch (e: any) {
      Alert.alert('Error', e.message);
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
          { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + Spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.navRow}>
          <Pressable onPress={() => router.back()}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.navTitle}>New Watchlist</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Title *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="My Watchlist"
            placeholderTextColor={Colors.text.muted}
            maxLength={50}
            autoFocus
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Optional description..."
            placeholderTextColor={Colors.text.muted}
            multiline
            numberOfLines={3}
            maxLength={200}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Visibility</Text>
          <View style={styles.visRow}>
            {VISIBILITY_OPTIONS.map((opt) => {
              const locked = opt.value === 'private' && !GATES.canHavePrivateWatchlists[tier];
              return (
                <Pressable
                  key={opt.value}
                  style={styles.visOptionWrapper}
                  onPress={() => {
                    if (locked) {
                      showPaywall('Private watchlists');
                    } else {
                      setVisibility(opt.value);
                    }
                  }}
                >
                  {visibility === opt.value ? (
                    <LinearGradient
                      colors={Colors.gradient.primary}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.visOption}
                    >
                      <Text style={styles.visIcon}>{opt.icon}</Text>
                      <Text style={styles.visLabelActive}>{opt.label}</Text>
                      {locked && <Text style={styles.lockBadge}>⭐</Text>}
                    </LinearGradient>
                  ) : (
                    <View style={styles.visOptionInactive}>
                      <Text style={styles.visIcon}>{opt.icon}</Text>
                      <Text style={styles.visLabel}>{opt.label}</Text>
                      {locked && <Text style={styles.lockBadge}>⭐</Text>}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleTitle}>
              Collaborative
              {GATES.maxCollaborativeWatchlists[tier] === 0 && ' ⭐'}
            </Text>
            <Text style={styles.toggleSub}>Allow friends to add titles</Text>
          </View>
          <Switch
            value={isCollaborative}
            onValueChange={(v) => {
              if (v && GATES.maxCollaborativeWatchlists[tier] === 0) {
                showPaywall('Collaborative watchlists');
              } else {
                setIsCollaborative(v);
              }
            }}
            trackColor={{ false: Colors.bg.elevated, true: Colors.accent }}
            thumbColor="#fff"
          />
        </View>

        <GradientButton
          label="Create Watchlist"
          onPress={handleCreate}
          loading={createWatchlist.isPending}
          style={styles.button}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.md,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
  },
  cancel: {
    color: Colors.text.dim,
    fontFamily: Typography.bodyMedium,
    fontSize: FontSize.md,
  },
  navTitle: {
    color: Colors.text.bright,
    fontFamily: Typography.heading,
    fontSize: FontSize.lg,
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
  textarea: {
    height: 90,
    textAlignVertical: 'top',
  },
  visRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  visOptionWrapper: {
    flex: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  visOption: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: 4,
    borderRadius: Radius.md,
  },
  visOptionInactive: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: 4,
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
  },
  visIcon: {
    fontSize: 18,
  },
  visLabel: {
    color: Colors.text.dim,
    fontFamily: Typography.bodyMedium,
    fontSize: FontSize.sm,
  },
  visLabelActive: {
    color: '#fff',
    fontFamily: Typography.bodySemiBold,
    fontSize: FontSize.sm,
  },
  lockBadge: {
    fontSize: 10,
    position: 'absolute',
    top: 4,
    right: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.bg.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.xl,
  },
  toggleTitle: {
    color: Colors.text.bright,
    fontFamily: Typography.bodySemiBold,
    fontSize: FontSize.md,
    marginBottom: 2,
  },
  toggleSub: {
    color: Colors.text.dim,
    fontFamily: Typography.body,
    fontSize: FontSize.sm,
  },
  button: {
    alignSelf: 'stretch',
  },
});
