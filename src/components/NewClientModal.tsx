import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, font, radius, spacing } from '@/theme/theme';

interface Props {
  visible: boolean;
  onCreate: (name: string) => void;
  onClose: () => void;
}

/** Bottom sheet to create a new client (patient) folder. */
export function NewClientModal({ visible, onCreate, onClose }: Props) {
  const [name, setName] = useState('');

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setName('');
    onCreate(trimmed);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>Ny klient</Text>
          <Text style={styles.subtitle}>
            Klienten får sin egen mappe med alle sessioner og det samlede
            behandlingsoverblik.
          </Text>

          <View style={styles.createRow}>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Klientens navn"
              placeholderTextColor={colors.textFaint}
              returnKeyType="done"
              autoFocus
              onSubmitEditing={handleCreate}
            />
            <Pressable
              style={[styles.createBtn, !name.trim() && styles.createBtnDisabled]}
              onPress={handleCreate}
              disabled={!name.trim()}
            >
              <Text style={styles.createBtnText}>Opret</Text>
            </Pressable>
          </View>
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
  subtitle: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  createRow: { flexDirection: 'row', gap: spacing.sm },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: font.size.md,
  },
  createBtn: {
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: {
    color: colors.accentSoft,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
  },
});
