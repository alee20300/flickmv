import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Dimensions,
  ListRenderItemInfo,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, FontSize, Spacing } from '../../src/constants/theme';

const { width: W } = Dimensions.get('window');

interface Slide {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  accent: string;
  posters: { bg: [string, string, ...string[]] }[];
}

const SLIDES: Slide[] = [
  {
    id: '1',
    eyebrow: 'CHAPTER 01',
    title: 'Discover movies\ntogether.',
    body: 'A cinematic feed curated by you and the people whose taste you trust.',
    accent: Colors.accent,
    posters: [
      { bg: ['rgba(147,51,234,0.9)', 'rgba(30,10,50,0.95)', '#0a0010'] },
      { bg: ['rgba(220,38,38,0.9)', 'rgba(50,10,10,0.95)', '#100005'] },
      { bg: ['rgba(200,200,220,0.5)', 'rgba(20,20,40,0.9)', '#05050a'] },
      { bg: ['rgba(236,72,153,0.85)', 'rgba(60,10,40,0.95)', '#0d0008'] },
    ],
  },
  {
    id: '2',
    eyebrow: 'CHAPTER 02',
    title: 'Build watchlists\nwith friends.',
    body: "Co-edit collections in real time. Decide tonight's movie before tonight.",
    accent: Colors.accentBlue,
    posters: [
      { bg: ['rgba(79,142,247,0.85)', 'rgba(10,20,50,0.95)', '#020510'] },
      { bg: ['rgba(245,158,59,0.9)', 'rgba(50,30,5,0.95)', '#100800'] },
      { bg: ['rgba(100,160,220,0.6)', 'rgba(10,20,40,0.9)', '#020508'] },
      { bg: ['rgba(30,120,200,0.8)', 'rgba(5,15,40,0.95)', '#010510'] },
    ],
  },
  {
    id: '3',
    eyebrow: 'CHAPTER 03',
    title: 'Compete on the\nleaderboard.',
    body: 'Earn points for trivia, hot takes, and getting friends to press play.',
    accent: Colors.error,
    posters: [
      { bg: ['rgba(220,60,40,0.9)', 'rgba(40,5,5,0.95)', '#0e0000'] },
      { bg: ['rgba(160,60,30,0.85)', 'rgba(30,10,5,0.95)', '#0a0200'] },
      { bg: ['rgba(240,180,60,0.8)', 'rgba(40,25,5,0.95)', '#0e0800'] },
      { bg: ['rgba(200,80,40,0.85)', 'rgba(35,8,5,0.95)', '#0c0100'] },
    ],
  },
  {
    id: '4',
    eyebrow: 'CHAPTER 04',
    title: 'Share your\nmovie taste.',
    body: "A living profile of what you've loved, what's next, and what you stand for.",
    accent: Colors.accent,
    posters: [
      { bg: ['rgba(100,60,180,0.85)', 'rgba(20,10,40,0.95)', '#080010'] },
      { bg: ['rgba(40,80,160,0.8)', 'rgba(10,15,40,0.95)', '#02040e'] },
      { bg: ['rgba(130,80,200,0.85)', 'rgba(25,10,45,0.95)', '#090012'] },
      { bg: ['rgba(60,40,140,0.8)', 'rgba(10,8,35,0.95)', '#03020e'] },
    ],
  },
];

function PosterFan({ posters, accent }: { posters: Slide['posters']; accent: string }) {
  const offsets = [
    { x: -115, rotate: '-12deg', scale: 0.86 },
    { x: -38, rotate: '-4deg', scale: 0.95 },
    { x: 38, rotate: '4deg', scale: 0.95 },
    { x: 115, rotate: '12deg', scale: 0.86 },
  ];

  return (
    <View style={styles.fanContainer}>
      {/* accent halo */}
      <View style={[styles.halo, { backgroundColor: accent }]} />
      {posters.map((p, i) => {
        const o = offsets[i];
        return (
          <View
            key={i}
            style={[
              styles.posterWrap,
              {
                transform: [{ translateX: o.x }, { rotate: o.rotate }, { scale: o.scale }],
              },
            ]}
          >
            <LinearGradient
              colors={p.bg}
              style={styles.poster}
              start={{ x: 0.3, y: 0 }}
              end={{ x: 0.7, y: 1 }}
            />
          </View>
        );
      })}
      {/* fade to bg */}
      <LinearGradient colors={['transparent', '#020205']} style={styles.fanFade} />
    </View>
  );
}

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flatRef = useRef<FlatList>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      flatRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
      setActiveIndex(activeIndex + 1);
    } else {
      router.replace('/(auth)/phone');
    }
  };

  const renderItem = ({ item }: ListRenderItemInfo<Slide>) => (
    <View style={styles.slide}>
      {/* poster fan hero */}
      <PosterFan posters={item.posters} accent={item.accent} />

      {/* skip */}
      <Pressable
        style={[styles.skipBtn, { top: insets.top + 12 }]}
        onPress={() => router.replace('/(auth)/phone')}
      >
        <Text style={styles.skip}>Skip</Text>
      </Pressable>

      {/* content */}
      <View style={styles.content}>
        <Text style={[styles.eyebrow, { color: item.accent }]}>{item.eyebrow}</Text>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.body}>{item.body}</Text>

        {/* progress bars */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.bar,
                i === activeIndex
                  ? styles.barActive
                  : { backgroundColor: 'rgba(255,255,255,0.18)' },
              ]}
            />
          ))}
        </View>

        {/* CTA */}
        <Pressable
          style={styles.cta}
          onPress={handleNext}
          android_ripple={{ color: 'rgba(0,0,0,0.1)' }}
        >
          <Text style={styles.ctaText}>
            {activeIndex === SLIDES.length - 1 ? 'Get started' : 'Continue'}
          </Text>
          <Text style={styles.ctaArrow}>›</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <FlatList
        ref={flatRef}
        data={SLIDES}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / W);
          setActiveIndex(index);
        }}
        style={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020205',
  },
  list: {
    flex: 1,
  },
  slide: {
    width: W,
    flex: 1,
    position: 'relative',
  },

  // poster fan
  fanContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 480,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  halo: {
    position: 'absolute',
    top: 80,
    width: 380,
    height: 300,
    borderRadius: 200,
    opacity: 0.22,
    // blur approximated via large borderRadius + opacity
  },
  posterWrap: {
    position: 'absolute',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
    elevation: 12,
  },
  poster: {
    width: 150,
    height: 225,
    borderRadius: 18,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  fanFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
  },

  // skip
  skipBtn: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
  },
  skip: {
    color: 'rgba(255,255,255,0.5)',
    fontFamily: Typography.bodyMedium,
    fontSize: FontSize.md,
  },

  // content
  content: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingBottom: 44,
  },
  eyebrow: {
    fontFamily: Typography.bodyMedium,
    fontSize: 10,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  title: {
    color: '#ffffff',
    fontFamily: Typography.heading,
    fontSize: 36,
    fontWeight: '600',
    letterSpacing: -1.2,
    lineHeight: 40,
    marginBottom: 16,
  },
  body: {
    color: 'rgba(255,255,255,0.62)',
    fontFamily: Typography.body,
    fontSize: FontSize.md,
    lineHeight: 22,
  },

  // progress bars
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 28,
    marginBottom: 22,
  },
  bar: {
    height: 4,
    width: 8,
    borderRadius: 2,
  },
  barActive: {
    width: 28,
    backgroundColor: '#ffffff',
  },

  // CTA
  cta: {
    backgroundColor: '#ffffff',
    borderRadius: 999,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  ctaText: {
    color: '#050508',
    fontFamily: Typography.bodySemiBold,
    fontSize: FontSize.lg,
    letterSpacing: -0.2,
  },
  ctaArrow: {
    color: '#050508',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '600',
  },
});
