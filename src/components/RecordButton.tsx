import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, font, radius } from '@/theme/theme';

interface RecordButtonProps {
  recording: boolean;
  onPress: () => void;
}

const SIZE = 96;

/** Big tactile record/stop control with a breathing halo while live. */
export function RecordButton({ recording, onPress }: RecordButtonProps) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (recording) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 1100,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    pulse.setValue(0);
  }, [recording, pulse]);

  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });

  const handlePress = () => {
    Haptics.impactAsync(
      recording ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy,
    );
    onPress();
  };

  return (
    <View style={styles.wrap}>
      {recording && (
        <Animated.View
          style={[
            styles.halo,
            { transform: [{ scale: haloScale }], opacity: haloOpacity },
          ]}
        />
      )}
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.button,
          recording ? styles.buttonRecording : styles.buttonIdle,
          pressed && { transform: [{ scale: 0.94 }] },
        ]}
      >
        {recording ? (
          <View style={styles.stopSquare} />
        ) : (
          <View style={styles.micWrap}>
            <Text style={styles.micGlyph}>●</Text>
          </View>
        )}
      </Pressable>
      <Text style={styles.caption}>{recording ? 'Tryk for at stoppe' : 'Tryk for at optage'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    top: 0,
    width: SIZE,
    height: SIZE,
    borderRadius: radius.pill,
    backgroundColor: colors.record,
  },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonIdle: {
    backgroundColor: colors.record,
    shadowColor: colors.record,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 12,
  },
  buttonRecording: {
    backgroundColor: colors.surfaceHi,
    borderWidth: 2,
    borderColor: colors.record,
  },
  micWrap: { alignItems: 'center', justifyContent: 'center' },
  micGlyph: { color: colors.white, fontSize: 34 },
  stopSquare: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.record,
  },
  caption: {
    marginTop: 16,
    color: colors.textMuted,
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
  },
});
