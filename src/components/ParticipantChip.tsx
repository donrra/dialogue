import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing, speakerColorFor } from '@/theme/theme';
import type { Participant } from '@/lib/types';

interface ChipProps {
  participant: Participant;
  /** When provided, shows a remove affordance and calls back on tap. */
  onRemove?: (id: string) => void;
  compact?: boolean;
}

export function ParticipantChip({ participant, onRemove, compact }: ChipProps) {
  const color = speakerColorFor(participant.colorIndex);
  const initials = participant.name.trim().slice(0, 1).toUpperCase() || '?';

  return (
    <View style={[styles.chip, compact && styles.chipCompact]}>
      <View style={[styles.avatar, { backgroundColor: color }]}>
        <Text style={styles.avatarText}>{initials}</Text>
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {participant.name}
      </Text>
      {onRemove && (
        <Pressable
          hitSlop={8}
          onPress={() => onRemove(participant.id)}
          style={styles.remove}
        >
          <Text style={styles.removeText}>×</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: spacing.xs,
    paddingRight: spacing.md,
    paddingVertical: spacing.xs,
    gap: spacing.sm,
    maxWidth: 220,
  },
  chipCompact: { paddingVertical: 2 },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.black,
    fontWeight: font.weight.bold,
    fontSize: font.size.sm,
  },
  name: {
    color: colors.text,
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
    flexShrink: 1,
  },
  remove: { marginLeft: spacing.xs },
  removeText: {
    color: colors.textFaint,
    fontSize: font.size.lg,
    lineHeight: font.size.lg,
  },
});
