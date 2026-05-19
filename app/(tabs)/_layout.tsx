import { Tabs } from 'expo-router';
import { Colors } from '../../src/constants/theme';
import { TabBar } from '../../src/components/navigation/TabBar';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="watchlists" options={{ title: 'Watchlists' }} />
      <Tabs.Screen name="friends" options={{ title: 'Friends' }} />
      <Tabs.Screen name="leaderboard" options={{ title: 'Ranks' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
