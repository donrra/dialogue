import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, font, radius, spacing } from '@/theme/theme';
import { formatDuration } from '@/lib/format';
import type { TranscriptSegment } from '@/lib/transcription';

interface Props {
  /** The line being corrected, or null when the sheet is closed. */
  segment: TranscriptSegment | null;
  /** Name to show for the speaker, already resolved from the speaker map. */
  speakerName: string;
  onSave: (text: string) => void;
  /** Puts the machine's original wording back. Only offered on an edited line. */
  onRevert: () => void;
  onClose: () => void;
}

/**
 * Sheet for correcting a single line of the transcript.
 *
 * One line at a time is the point. A session runs to hundreds of lines, and
 * nobody retypes those on a phone - but tapping the three that came out wrong
 * is quick, and it keeps the reader's place in the conversation.
 */
export function SegmentEditModal({
  segment,
  speakerName,
  onSave,
  onRevert,
  onClose,
}: Props) {
  const [text, setText] = useState('');

  useEffect(() => {
    if (segment) setText(segment.text);
  }, [segment]);

  const trimmed = text.trim();
  const changed = !!segment && trimmed !== segment.text;
  const canSave = trimmed.length > 0 && changed;

  return (
    <Modal
      visible={segment !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />

            <View style={styles.headRow}>
              <Text style={styles.title}>Ret teksten</Text>
              {segment ? (
                <Text style={styles.meta}>
                  {speakerName} · {formatDuration(segment.start * 1000)}
                </Text>
              ) : null}
            </View>

            <TextInput
              value={text}
              onChangeText={setText}
              style={styles.input}
              multiline
              autoFocus
              textAlignVertical="top"
              selectionColor={colors.accent}
              placeholder="Hvad blev der sagt?"
              placeholderTextColor={colors.textFaint}
            />

            {segment?.edited && segment.original ? (
              <View style={styles.originalBox}>
                <Text style={styles.originalLabel}>Maskinen hørte</Text>
                <Text style={styles.originalText}>{segment.original}</Text>
              </View>
            ) : null}

            <Pressable
              style={[styles.save, !canSave && styles.saveOff]}
              disabled={!canSave}
              onPress={() => onSave(trimmed)}
            >
              <Text style={styles.saveText}>Gem rettelse</Text>
            </Pressable>

            {segment?.edited && segment.original ? (
              <Pressable style={styles.secondary} onPress={onRevert}>
                <Text style={styles.secondaryText}>Fortryd rettelsen</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.secondary} onPress={onClose}>
                <Text style={styles.secondaryText}>Fortryd</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
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
  headRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  title: { color: colors.text, fontSize: font.size.xl, fontWeight: font.weight.bold },
  meta: { color: colors.textFaint, fontSize: font.size.xs, fontVariant: ['tabular-nums'] },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderHi,
    borderRadius: radius.md,
    padding: spacing.lg,
    minHeight: 120,
    color: colors.text,
    fontSize: font.size.md,
    lineHeight: 23,
  },
  originalBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  originalLabel: { color: colors.textFaint, fontSize: font.size.xs },
  originalText: { color: colors.textMuted, fontSize: font.size.sm, lineHeight: 20 },
  save: {
    marginTop: spacing.lg,
    padding: spacing.md,
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  saveOff: { backgroundColor: colors.surfaceHi },
  saveText: { color: colors.black, fontSize: font.size.md, fontWeight: font.weight.bold },
  secondary: { marginTop: spacing.sm, padding: spacing.md, alignItems: 'center' },
  secondaryText: { color: colors.textMuted, fontSize: font.size.sm, fontWeight: font.weight.medium },
});
