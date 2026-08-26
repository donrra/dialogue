import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius, spacing, speakerColorFor } from '@/theme/theme';
import { useConversations } from '@/context/ConversationsContext';
import { useClients } from '@/context/ClientsContext';
import { ParticipantChip } from '@/components/ParticipantChip';
import { AudioPlayerBar } from '@/components/AudioPlayerBar';
import { TranscriptSection } from '@/components/TranscriptSection';
import { AnalysisSection } from '@/components/AnalysisSection';
import { ClientPickerModal } from '@/components/ClientPickerModal';
import { formatBytes, formatDate, formatDuration } from '@/lib/format';

export default function ConversationDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getById, remove, update } = useConversations();
  const { clients, getById: getClient, create: createClient } = useClients();
  const [clientPicker, setClientPicker] = useState(false);
  const conversation = getById(id);

  if (!conversation) {
    return (
      <View style={styles.root}>
        <Text style={styles.missing}>Samtalen blev ikke fundet.</Text>
      </View>
    );
  }

  const handleDelete = () => {
    Alert.alert('Slet samtale?', 'Optagelsen og indholdet slettes permanent.', [
      { text: 'Annullér', style: 'cancel' },
      {
        text: 'Slet',
        style: 'destructive',
        onPress: () => {
          remove(id);
          router.replace('/');
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.replace('/')} hitSlop={12} style={styles.iconBtn}>
          <Text style={styles.iconText}>‹</Text>
        </Pressable>
        <Pressable onPress={handleDelete} hitSlop={12}>
          <Text style={styles.delete}>Slet</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{conversation.title}</Text>
        <Text style={styles.meta}>
          {formatDate(conversation.createdAt)}
          {conversation.durationMs ? `  ·  ${formatDuration(conversation.durationMs)}` : ''}
          {conversation.fileSizeBytes ? `  ·  ${formatBytes(conversation.fileSizeBytes)}` : ''}
        </Text>

        {conversation.audioUri && (
          <View style={{ marginTop: spacing.xl }}>
            <AudioPlayerBar uri={conversation.audioUri} />
          </View>
        )}

        <Text style={styles.sectionLabel}>Deltagere</Text>
        <View style={styles.chips}>
          {conversation.participants.length === 0 ? (
            <Text style={styles.faint}>Ingen deltagere registreret.</Text>
          ) : (
            conversation.participants.map((p) => (
              <ParticipantChip key={p.id} participant={p} />
            ))
          )}
        </View>

        {/* Klient-mappe: which patient folder this session belongs to */}
        <Text style={styles.sectionLabel}>Klient</Text>
        {(() => {
          const client = conversation.clientId
            ? getClient(conversation.clientId)
            : undefined;
          return (
            <Pressable
              style={({ pressed }) => [styles.clientRow, pressed && styles.clientRowPressed]}
              onPress={() => setClientPicker(true)}
            >
              {client ? (
                <>
                  <View
                    style={[
                      styles.clientDot,
                      { backgroundColor: speakerColorFor(client.colorIndex) },
                    ]}
                  />
                  <Text style={styles.clientName}>{client.name}</Text>
                  <Text style={styles.clientHint}>· åbn mappe eller skift</Text>
                </>
              ) : (
                <Text style={styles.clientEmpty}>
                  Vælg klient - så samles sessionerne i én mappe
                </Text>
              )}
            </Pressable>
          );
        })()}
        {conversation.clientId && getClient(conversation.clientId) && (
          <Pressable
            style={styles.openFolder}
            onPress={() => router.push(`/client/${conversation.clientId}`)}
          >
            <Text style={styles.openFolderText}>
              Åbn {getClient(conversation.clientId)!.name}s mappe ›
            </Text>
          </Pressable>
        )}

        {/* Fase 2 — transcript */}
        <Text style={styles.sectionLabel}>Transskribering</Text>
        <TranscriptSection conversation={conversation} />

        {/* Fase 3 — analysis */}
        <Text style={styles.sectionLabel}>Analyse</Text>
        <AnalysisSection conversation={conversation} />
      </ScrollView>

      <ClientPickerModal
        visible={clientPicker}
        clients={clients}
        currentClientId={conversation.clientId}
        suggestions={conversation.participants.map((p) => p.name)}
        onPick={(clientId) => {
          update(id, { clientId });
          setClientPicker(false);
        }}
        onCreate={(name) => {
          const client = createClient(name);
          update(id, { clientId: client.id });
          setClientPicker(false);
        }}
        onUnlink={() => {
          update(id, { clientId: undefined });
          setClientPicker(false);
        }}
        onClose={() => setClientPicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  missing: { color: colors.textMuted, textAlign: 'center', marginTop: 120 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  iconText: { color: colors.text, fontSize: 30, lineHeight: 30 },
  delete: { color: colors.danger, fontSize: font.size.sm, fontWeight: font.weight.semibold },
  title: {
    color: colors.text,
    fontSize: font.size.xxl,
    fontWeight: font.weight.bold,
    letterSpacing: -0.5,
  },
  meta: { color: colors.textMuted, fontSize: font.size.sm, marginTop: spacing.sm },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  faint: { color: colors.textFaint, fontSize: font.size.sm },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  clientRowPressed: { backgroundColor: colors.surfaceHi },
  clientDot: { width: 10, height: 10, borderRadius: 5 },
  clientName: { color: colors.text, fontSize: font.size.md, fontWeight: font.weight.semibold },
  clientHint: { color: colors.textFaint, fontSize: font.size.xs },
  clientEmpty: { color: colors.textMuted, fontSize: font.size.sm },
  openFolder: { marginTop: spacing.sm, paddingVertical: spacing.xs },
  openFolderText: {
    color: colors.accentSoft,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
  },
  placeholder: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  placeholderTitle: {
    color: colors.text,
    fontSize: font.size.md,
    fontWeight: font.weight.semibold,
    marginBottom: spacing.xs,
  },
  placeholderBody: { color: colors.textMuted, fontSize: font.size.sm, lineHeight: 20 },
});
