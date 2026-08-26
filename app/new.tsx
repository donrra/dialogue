import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, font, radius, spacing } from '@/theme/theme';
import { Button } from '@/components/Button';
import { ParticipantChip } from '@/components/ParticipantChip';
import { useConversations } from '@/context/ConversationsContext';
import { makeId } from '@/lib/id';
import type { Participant } from '@/lib/types';

function defaultTitle(): string {
  const now = new Date();
  return `Samtale ${now.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })}`;
}

export default function NewConversationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { upsert } = useConversations();

  const [title, setTitle] = useState(defaultTitle());
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [name, setName] = useState('');

  const addParticipant = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    Haptics.selectionAsync();
    setParticipants((prev) => [
      ...prev,
      { id: makeId('p_'), name: trimmed, colorIndex: prev.length },
    ]);
    setName('');
  };

  const removeParticipant = (id: string) => {
    setParticipants((prev) => prev.filter((p) => p.id !== id));
  };

  const startRecording = () => {
    const id = makeId('c_');
    upsert({
      id,
      title: title.trim() || defaultTitle(),
      createdAt: Date.now(),
      status: 'recording',
      participants,
    });
    router.replace(`/record/${id}?autostart=1`);
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.close}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Ny samtale</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.label}>Titel</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          style={styles.input}
          placeholder="Giv samtalen en titel"
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.accent}
        />

        <Text style={[styles.label, { marginTop: spacing.xl }]}>Deltagere</Text>
        <Text style={styles.hint}>
          Skriv hvem der er med. Du kan også tilføje flere undervejs i samtalen.
        </Text>

        <View style={styles.addRow}>
          <TextInput
            value={name}
            onChangeText={setName}
            style={[styles.input, styles.addInput]}
            placeholder="Navn"
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.accent}
            onSubmitEditing={addParticipant}
            returnKeyType="done"
          />
          <Pressable
            onPress={addParticipant}
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.addBtnText}>＋</Text>
          </Pressable>
        </View>

        {participants.length > 0 && (
          <View style={styles.chips}>
            {participants.map((p) => (
              <ParticipantChip key={p.id} participant={p} onRemove={removeParticipant} />
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button label="Start optagelse" onPress={startRecording} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.textMuted, fontSize: font.size.lg },
  headerTitle: { color: colors.text, fontSize: font.size.lg, fontWeight: font.weight.semibold },
  label: {
    color: colors.text,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
    marginBottom: spacing.sm,
  },
  hint: { color: colors.textMuted, fontSize: font.size.sm, marginBottom: spacing.md, lineHeight: 20 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 52,
    color: colors.text,
    fontSize: font.size.md,
  },
  addRow: { flexDirection: 'row', gap: spacing.sm },
  addInput: { flex: 1 },
  addBtn: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: colors.accentSoft, fontSize: font.size.xl, fontWeight: font.weight.bold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
});
