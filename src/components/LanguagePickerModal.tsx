import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, font, radius, spacing } from '@/theme/theme';
import { LANGUAGE_OPTIONS, DEFAULT_LANGUAGES } from '@/lib/languages';

interface Props {
  visible: boolean;
  /** Languages currently set on the conversation. */
  selected: string[];
  /** Confirmed selection - the caller decides what to do with it. */
  onConfirm: (codes: string[]) => void;
  onClose: () => void;
  /** Defaults to the re-run wording used on an existing transcript. */
  confirmLabel?: string;
}

/**
 * Bottom sheet for choosing which languages were actually spoken.
 *
 * The wording matters here: picking extra languages "just in case" is what
 * ruined the first transcripts, so the sheet says so plainly rather than
 * presenting the list as a harmless set of checkboxes.
 */
export function LanguagePickerModal({
  visible,
  selected,
  onConfirm,
  onClose,
  confirmLabel = 'Lav teksten om',
}: Props) {
  const [picked, setPicked] = useState<string[]>(selected);

  // Reopening the sheet should show what is actually saved, not the last edit.
  useEffect(() => {
    if (visible) setPicked(selected.length ? selected : DEFAULT_LANGUAGES);
  }, [visible, selected]);

  const toggle = (code: string) => {
    Haptics.selectionAsync();
    setPicked((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const canConfirm = picked.length > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>Hvilke sprog blev der talt?</Text>
          <Text style={styles.subtitle}>
            Vælg kun de sprog der faktisk blev sagt noget på. Jo færre du vælger,
            jo mere præcis bliver teksten. Vælger du flere, skal den gætte for
            hver sætning, og så kan den finde på at oversætte forkert.
          </Text>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
            {LANGUAGE_OPTIONS.map((lang) => {
              const on = picked.includes(lang.code);
              return (
                <Pressable
                  key={lang.code}
                  style={({ pressed }) => [
                    styles.row,
                    on && styles.rowOn,
                    pressed && styles.rowPressed,
                  ]}
                  onPress={() => toggle(lang.code)}
                >
                  <View style={[styles.check, on && styles.checkOn]}>
                    {on ? <Text style={styles.checkMark}>✓</Text> : null}
                  </View>
                  <Text style={[styles.rowName, on && styles.rowNameOn]}>{lang.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable
            style={[styles.confirm, !canConfirm && styles.confirmOff]}
            disabled={!canConfirm}
            onPress={() => onConfirm(picked)}
          >
            <Text style={styles.confirmText}>
              {canConfirm ? confirmLabel : 'Vælg mindst ét sprog'}
            </Text>
          </Pressable>
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>Fortryd</Text>
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
    maxHeight: '85%',
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
  subtitle: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    lineHeight: 20,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  scroll: { flexGrow: 0 },
  list: { gap: spacing.sm, paddingBottom: spacing.sm },
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
  rowOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  rowPressed: { backgroundColor: colors.surfaceHi },
  check: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkMark: { color: colors.black, fontSize: font.size.sm, fontWeight: font.weight.bold },
  rowName: { color: colors.text, fontSize: font.size.md, fontWeight: font.weight.medium },
  rowNameOn: { color: colors.accentSoft },
  confirm: {
    marginTop: spacing.lg,
    padding: spacing.md,
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  confirmOff: { backgroundColor: colors.surfaceHi },
  confirmText: { color: colors.black, fontSize: font.size.md, fontWeight: font.weight.bold },
  cancel: { marginTop: spacing.sm, padding: spacing.md, alignItems: 'center' },
  cancelText: { color: colors.textMuted, fontSize: font.size.sm, fontWeight: font.weight.medium },
});
