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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, font, radius, spacing } from '@/theme/theme';
import { Button } from '@/components/Button';
import { ParticipantChip } from '@/components/ParticipantChip';
import { useConversations } from '@/context/ConversationsContext';
import { useClients } from '@/context/ClientsContext';
import { LanguagePickerModal } from '@/components/LanguagePickerModal';
import { DEFAULT_LANGUAGES, languageSummary } from '@/lib/languages';
import { makeId } from '@/lib/id';
import type { Participant } from '@/lib/types';

function defaultTitle(prefix: string): string {
  const now = new Date();
  return `${prefix} ${now.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })}`;
}

export default function NewConversationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { upsert } = useConversations();
  const { getById: getClient, update: updateClient } = useClients();

  // Started from a client folder? Then the session is linked from birth and
  // the client is already a participant - no retyping of names.
  const { clientId } = useLocalSearchParams<{ clientId?: string }>();
  const client = clientId ? getClient(clientId) : undefined;

  const [title, setTitle] = useState(defaultTitle(client ? 'Session' : 'Samtale'));
  const [participants, setParticipants] = useState<Participant[]>(
    client ? [{ id: makeId('p_'), name: client.name, colorIndex: 0 }] : [],
  );
  const [name, setName] = useState('');

  // A client speaks the same languages every session, so the folder remembers
  // them. Getting this right up front is what decides whether the transcript is
  // usable at all: anything not on this list comes back as nonsense.
  const [languages, setLanguages] = useState<string[]>(
    client?.languages?.length ? client.languages : DEFAULT_LANGUAGES,
  );
  const [langPicker, setLangPicker] = useState(false);

  const pickLanguages = (codes: string[]) => {
    setLanguages(codes);
    setLangPicker(false);
    // Remember it on the client so the next session starts out right.
    if (client) updateClient(client.id, { languages: codes });
  };

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
      title: title.trim() || defaultTitle(client ? 'Session' : 'Samtale'),
      createdAt: Date.now(),
      status: 'recording',
      participants,
      clientId: client?.id,
      languages,
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
        <Text style={styles.headerTitle}>
          {client ? `Ny session · ${client.name}` : 'Ny samtale'}
        </Text>
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

        <Text style={[styles.label, { marginTop: spacing.xl }]}>Talt sprog</Text>
        <Text style={styles.hint}>
          Vælg de sprog der bliver talt. Sprog du ikke vælger, bliver skrevet ud
          som volapyk. {client ? 'Valget huskes på klienten.' : ''}
        </Text>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setLangPicker(true);
          }}
          style={({ pressed }) => [styles.langRow, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.langValue}>{languageSummary(languages)}</Text>
          <Text style={styles.langChange}>Skift</Text>
        </Pressable>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button label="Start optagelse" onPress={startRecording} />
      </View>

      <LanguagePickerModal
        visible={langPicker}
        selected={languages}
        confirmLabel="Gem sprog"
        onConfirm={pickLanguages}
        onClose={() => setLangPicker(false)}
      />
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
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    minHeight: 52,
    paddingVertical: spacing.md,
  },
  langValue: { color: colors.text, fontSize: font.size.md, flex: 1 },
  langChange: { color: colors.accentSoft, fontSize: font.size.sm, fontWeight: font.weight.semibold },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
});
