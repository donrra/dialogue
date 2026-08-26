import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing, speakerColorFor } from '@/theme/theme';
import { formatDate, formatDuration } from '@/lib/format';
import type { Conversation, ConversationStatus } from '@/lib/types';

const STATUS_LABEL: Record<ConversationStatus, string> = {
  recording: 'Optager',
  recorded: 'Klar til tekst',
  transcribed: 'Transskriberet',
  analyzed: 'Analyseret',
};

const STATUS_COLOR: Record<ConversationStatus, string> = {
  recording: colors.record,
  recorded: colors.warning,
  transcribed: colors.accentSoft,
  analyzed: colors.success,
};

interface CardProps {
  conversation: Conversation;
  onPress: () => void;
}

export function ConversationCard({ conversation, onPress }: CardProps) {
  const { title, createdAt, durationMs, participants, status } = conversation;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.topRow}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={[styles.badge, { backgroundColor: STATUS_COLOR[status] + '22' }]}>
          {status === 'recording' && <View style={styles.liveDot} />}
          <Text style={[styles.badgeText, { color: STATUS_COLOR[status] }]}>
            {STATUS_LABEL[status]}
          </Text>
        </View>
      </View>

      <Text style={styles.meta}>
        {formatDate(createdAt)}
        {durationMs ? `  ·  ${formatDuration(durationMs)}` : ''}
      </Text>

      <View style={styles.avatars}>
        {participants.slice(0, 5).map((p, i) => (
          <View
            key={p.id}
            style={[
              styles.avatar,
              {
                backgroundColor: speakerColorFor(p.colorIndex),
                marginLeft: i === 0 ? 0 : -8,
              },
            ]}
          >
            <Text style={styles.avatarText}>
              {p.name.trim().slice(0, 1).toUpperCase() || '?'}
            </Text>
          </View>
        ))}
        {participants.length > 5 && (
          <Text style={styles.more}>+{participants.length - 5}</Text>
        )}
        <Text style={styles.count}>
          {participants.length} deltager{participants.length === 1 ? '' : 'e'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  pressed: { backgroundColor: colors.surfaceHi },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: font.size.lg,
    fontWeight: font.weight.semibold,
    flex: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.record },
  badgeText: { fontSize: font.size.xs, fontWeight: font.weight.semibold },
  meta: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  avatars: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  avatarText: { color: colors.black, fontWeight: font.weight.bold, fontSize: font.size.sm },
  more: { color: colors.textMuted, fontSize: font.size.sm, marginLeft: spacing.sm },
  count: { color: colors.textFaint, fontSize: font.size.sm, marginLeft: spacing.md },
});
