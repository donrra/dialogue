import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing, speakerColorFor } from '@/theme/theme';
import type { Participant } from '@/lib/types';

interface Props {
  visible: boolean;
  speakerLabel: string | null; // e.g. "Taler 1"
  participants: Participant[];
  onPick: (name: string) => void;
  onReset: () => void;
  onClose: () => void;
}

/** Bottom sheet to map a diarized speaker ("Taler 1") to a participant's name. */
export function SpeakerPickerModal({
  visible,
  speakerLabel,
  participants,
  onPick,
  onReset,
  onClose,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>Hvem er {speakerLabel}?</Text>
          <Text style={styles.subtitle}>Vælg en deltager — det gælder alle steder denne taler optræder.</Text>

          <View style={styles.list}>
            {participants.length === 0 && (
              <Text style={styles.empty}>Ingen deltagere på samtalen.</Text>
            )}
            {participants.map((p) => (
              <Pressable
                key={p.id}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => onPick(p.name)}
              >
                <View style={[styles.avatar, { backgroundColor: speakerColorFor(p.colorIndex) }]}>
                  <Text style={styles.avatarText}>
                    {p.name.trim().slice(0, 1).toUpperCase() || '?'}
                  </Text>
                </View>
                <Text style={styles.rowName}>{p.name}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={styles.reset} onPress={onReset}>
            <Text style={styles.resetText}>Behold som {speakerLabel}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxxl,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderHi,
    marginBottom: spacing.lg,
  },
  title: { color: colors.text, fontSize: font.size.xl, fontWeight: font.weight.bold },
  subtitle: { color: colors.textMuted, fontSize: font.size.sm, marginTop: spacing.xs, marginBottom: spacing.lg },
  list: { gap: spacing.sm },
  empty: { color: colors.textFaint, fontSize: font.size.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.surfaceHi },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.black, fontWeight: font.weight.bold, fontSize: font.size.md },
  rowName: { color: colors.text, fontSize: font.size.md, fontWeight: font.weight.medium },
  reset: {
    marginTop: spacing.lg,
    padding: spacing.md,
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resetText: { color: colors.textMuted, fontSize: font.size.sm, fontWeight: font.weight.medium },
});
