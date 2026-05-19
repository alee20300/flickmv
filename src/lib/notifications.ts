import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerPushToken(userId: string): Promise<void> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    const platform = Platform.OS === 'ios' ? 'ios' : 'android';

    // Upsert into push_tokens for server-side dispatch
    await supabase
      .from('push_tokens')
      .upsert({ user_id: userId, token: tokenData.data, platform }, { onConflict: 'token' });

    // Keep users.push_token in sync for legacy reads
    await supabase.from('users').update({ push_token: tokenData.data }).eq('id', userId);
  } catch {
    // Push token registration is non-blocking
  }
}
