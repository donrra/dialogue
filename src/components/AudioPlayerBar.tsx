import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { colors, font, radius, spacing } from '@/theme/theme';
import { formatDuration } from '@/lib/format';

/** Compact playback control for a recorded conversation. */
export function AudioPlayerBar({ uri }: { uri: string }) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);

  // Make sure playback is audible even if the phone is on silent.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  // Restart from the beginning once finished, so the button returns to "play".
  useEffect(() => {
    if (status.didJustFinish) {
      player.seekTo(0);
      player.pause();
    }
  }, [status.didJustFinish, player]);

  const toggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (status.playing) player.pause();
    else player.play();
  };

  const total = status.duration || 0;
  const current = status.currentTime || 0;
  const progress = total > 0 ? Math.min(current / total, 1) : 0;

  return (
    <View style={styles.bar}>
      <Pressable onPress={toggle} style={styles.play}>
        <Text style={styles.playGlyph}>{status.playing ? '❚❚' : '▶'}</Text>
      </Pressable>
      <View style={styles.right}>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={styles.times}>
          <Text style={styles.time}>{formatDuration(current * 1000)}</Text>
          <Text style={styles.time}>{formatDuration(total * 1000)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  play: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playGlyph: { color: colors.white, fontSize: font.size.md, fontWeight: font.weight.bold },
  right: { flex: 1, gap: spacing.sm },
  track: { height: 5, borderRadius: radius.pill, backgroundColor: colors.surfaceHi, overflow: 'hidden' },
  fill: { height: 5, borderRadius: radius.pill, backgroundColor: colors.accent },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    fontVariant: ['tabular-nums'],
  },
});
