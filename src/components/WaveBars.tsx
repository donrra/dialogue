import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors, radius } from '@/theme/theme';

interface Props {
  active: boolean;
  color?: string;
  bars?: number;
}

/** Decorative live equalizer shown while recording. Purely visual. */
export function WaveBars({ active, color = colors.accent, bars = 5 }: Props) {
  const values = useRef(
    Array.from({ length: bars }, () => new Animated.Value(0.3)),
  ).current;

  useEffect(() => {
    if (!active) {
      values.forEach((v) => v.stopAnimation(() => v.setValue(0.3)));
      return;
    }
    const animations = values.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, {
            toValue: 1,
            duration: 320 + i * 90,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0.25,
            duration: 320 + i * 70,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [active, values]);

  return (
    <View style={styles.row}>
      {values.map((v, i) => (
        <Animated.View
          key={i}
          style={[styles.bar, { backgroundColor: color, transform: [{ scaleY: v }] }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 36 },
  bar: { width: 5, height: 36, borderRadius: radius.pill },
});
