import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing } from '@/theme/theme';
import { useRecording } from '@/context/RecordingContext';
import { formatDuration } from '@/lib/format';

/** Tap-to-return banner shown on Home while a recording is in progress. */
export function LiveBanner({ onPress }: { onPress: () => void }) {
  const { durationMs, isPaused } = useRecording();
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.banner, pressed && { opacity: 0.9 }]}
    >
      <Animated.View style={[styles.dot, { opacity: blink }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{isPaused ? 'Optagelse på pause' : 'Optager nu'}</Text>
        <Text style={styles.sub}>Tryk for at vende tilbage til optagelsen</Text>
      </View>
      <Text style={styles.time}>{formatDuration(durationMs)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.recordDim,
    borderWidth: 1,
    borderColor: colors.record,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.record },
  title: { color: colors.text, fontSize: font.size.md, fontWeight: font.weight.semibold },
  sub: { color: colors.textMuted, fontSize: font.size.xs, marginTop: 2 },
  time: {
    color: colors.recordSoft,
    fontSize: font.size.lg,
    fontWeight: font.weight.bold,
    fontVariant: ['tabular-nums'],
  },
});
