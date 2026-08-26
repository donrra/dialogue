import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, font, radius, spacing, speakerColorFor } from '@/theme/theme';
import type { Client } from '@/lib/types';

interface Props {
  visible: boolean;
  clients: Client[];
  currentClientId?: string;
  /** Participant names from the conversation - offered as one-tap creates. */
  suggestions?: string[];
  onPick: (clientId: string) => void;
  onCreate: (name: string) => void;
  onUnlink: () => void;
  onClose: () => void;
}

/** Bottom sheet to link a conversation to a client (patient) folder. */
export function ClientPickerModal({
  visible,
  clients,
  currentClientId,
  suggestions,
  onPick,
  onCreate,
  onUnlink,
  onClose,
}: Props) {
  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    setNewName('');
    onCreate(name);
  };

  // Only suggest names that aren't already clients.
  const existingNames = new Set(clients.map((c) => c.name.trim().toLowerCase()));
  const quickCreates = (suggestions ?? [])
    .map((n) => n.trim())
    .filter((n) => n && !existingNames.has(n.toLowerCase()));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>Hvilken klient hører samtalen til?</Text>
          <Text style={styles.subtitle}>
            Sessionen lægges i klientens mappe, hvor det samlede behandlingsoverblik bor.
          </Text>

          <View style={styles.list}>
            {clients.map((c) => {
              const selected = c.id === currentClientId;
              return (
                <Pressable
                  key={c.id}
                  style={({ pressed }) => [
                    styles.row,
                    selected && styles.rowSelected,
                    pressed && styles.rowPressed,
                  ]}
                  onPress={() => onPick(c.id)}
                >
                  <View
                    style={[styles.avatar, { backgroundColor: speakerColorFor(c.colorIndex) }]}
                  >
                    <Text style={styles.avatarText}>
                      {c.name.trim().slice(0, 1).toUpperCase() || '?'}
                    </Text>
                  </View>
                  <Text style={styles.rowName}>{c.name}</Text>
                  {selected && <Text style={styles.check}>✓</Text>}
                </Pressable>
              );
            })}
          </View>

          {quickCreates.length > 0 && (
            <View style={styles.suggestBlock}>
              {quickCreates.map((n) => (
                <Pressable
                  key={n}
                  style={({ pressed }) => [styles.suggestBtn, pressed && styles.rowPressed]}
                  onPress={() => onCreate(n)}
                >
                  <Text style={styles.suggestText}>Opret "{n}" som klient</Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.createRow}>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder="Ny klient - skriv navn"
              placeholderTextColor={colors.textFaint}
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />
            <Pressable
              style={[styles.createBtn, !newName.trim() && styles.createBtnDisabled]}
              onPress={handleCreate}
              disabled={!newName.trim()}
            >
              <Text style={styles.createBtnText}>Opret</Text>
            </Pressable>
          </View>

          {currentClientId && (
            <Pressable style={styles.unlink} onPress={onUnlink}>
              <Text style={styles.unlinkText}>Fjern kobling til klient</Text>
            </Pressable>
          )}
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
  },
  list: { gap: spacing.sm },
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
  rowSelected: { borderColor: colors.accent },
  rowPressed: { backgroundColor: colors.surfaceHi },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.black, fontWeight: font.weight.bold, fontSize: font.size.md },
  rowName: { color: colors.text, fontSize: font.size.md, fontWeight: font.weight.medium, flex: 1 },
  check: { color: colors.accentSoft, fontSize: font.size.md, fontWeight: font.weight.bold },
  suggestBlock: { gap: spacing.sm, marginTop: spacing.lg },
  suggestBtn: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
  },
  suggestText: {
    color: colors.accentSoft,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
  },
  createRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
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
  unlink: {
    marginTop: spacing.lg,
    padding: spacing.md,
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unlinkText: { color: colors.textMuted, fontSize: font.size.sm, fontWeight: font.weight.medium },
});
