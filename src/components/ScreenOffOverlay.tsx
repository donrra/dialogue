import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Brightness from 'expo-brightness';
import * as Haptics from 'expo-haptics';
import { colors, font, spacing } from '@/theme/theme';
import { formatDuration } from '@/lib/format';

interface Props {
  visible: boolean;
  durationMs: number;
  onWake: () => void;
}

/**
 * Full-screen black cover that dims the display to save battery while the
 * recording keeps running. Tap anywhere to bring the screen back.
 * We dim the app's brightness rather than truly powering the screen off —
 * an app cannot turn the hardware screen off, but this achieves the same feel
 * and the recording continues regardless via the foreground service.
 */
export function ScreenOffOverlay({ visible, durationMs, onWake }: Props) {
  const prevBrightness = useRef<number | null>(null);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;

    async function dim() {
      try {
        const current = await Brightness.getBrightnessAsync();
        if (cancelled) return;
        prevBrightness.current = current;
        await Brightness.setBrightnessAsync(0);
      } catch {
        // Brightness control can fail on some devices — overlay still works.
      }
    }

    async function restore() {
      try {
        if (prevBrightness.current != null) {
          await Brightness.setBrightnessAsync(prevBrightness.current);
          prevBrightness.current = null;
        } else {
          await Brightness.restoreSystemBrightnessAsync();
        }
      } catch {
        // ignore
      }
    }

    if (visible) {
      dim();
    } else {
      restore();
    }

    return () => {
      cancelled = true;
      if (visible) restore();
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.2, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, pulse]);

  if (!visible) return null;

  return (
    <Pressable
      style={styles.overlay}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onWake();
      }}
    >
      <View style={styles.center}>
        <Animated.View style={[styles.dot, { opacity: pulse }]} />
        <Text style={styles.label}>Optager · {formatDuration(durationMs)}</Text>
        <Text style={styles.hint}>Tryk for at tænde skærmen</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  center: { alignItems: 'center', gap: spacing.md },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.record },
  label: {
    color: '#3A3A48',
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
    fontVariant: ['tabular-nums'],
  },
  hint: { color: '#1F1F28', fontSize: font.size.xs },
});
