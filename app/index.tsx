import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius, spacing, speakerColorFor } from '@/theme/theme';
import { useConversations } from '@/context/ConversationsContext';
import { useClients } from '@/context/ClientsContext';
import { useRecording } from '@/context/RecordingContext';
import { getTranscription } from '@/lib/transcription';
import { deleteLocalAudio } from '@/lib/audioCleanup';
import { Button } from '@/components/Button';
import { ConversationCard } from '@/components/ConversationCard';
import { LiveBanner } from '@/components/LiveBanner';
import { NewClientModal } from '@/components/NewClientModal';
import { ClientPickerModal } from '@/components/ClientPickerModal';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { conversations, loading, update } = useConversations();
  const { clients, create: createClient } = useClients();
  const { activeConversationId } = useRecording();
  const [newClient, setNewClient] = useState(false);
  const [startSession, setStartSession] = useState(false);
  const [search, setSearch] = useState('');

  // Poll transcription status while on screen; when a transcript is done the
  // audio has served its purpose and is deleted from the device.
  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      const interval = setInterval(async () => {
        if (!active) return;
        for (const c of conversations) {
          if (c.status === 'recorded') {
            const tr = await getTranscription(c.id);
            if (active && tr?.status === 'done') {
              await deleteLocalAudio(c);
              update(c.id, {
                status: 'transcribed',
                audioUri: undefined,
                compressedUri: undefined,
              });
            }
          }
        }
      }, 3000);
      return () => {
        active = false;
        clearInterval(interval);
      };
    }, [conversations, update]),
  );

  const recent = conversations.slice(0, 3);
  const unlinked = conversations.filter(
    (c) => !c.clientId && !recent.includes(c),
  );

  const q = search.trim().toLowerCase();
  const visibleClients = q
    ? clients.filter((c) => c.name.toLowerCase().includes(q))
    : clients;

  const sessionCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of conversations) {
      if (c.clientId) map[c.clientId] = (map[c.clientId] ?? 0) + 1;
    }
    return map;
  }, [conversations]);

  const clientNameFor = (clientId?: string) =>
    clientId ? clients.find((k) => k.id === clientId)?.name : undefined;

  const openConversation = (id: string, status: string) =>
    router.push(status === 'recording' ? `/record/${id}` : `/conversation/${id}`);

  return (
    <View style={styles.root}>
      <FlatList
        data={visibleClients}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.lg,
          paddingHorizontal: spacing.xl,
          paddingBottom: 120,
        }}
        ListHeaderComponent={
          <View>
            <Text style={styles.kicker}>OVERBLIK</Text>
            <Text style={styles.title}>Dialogue</Text>
            {activeConversationId && (
              <LiveBanner
                onPress={() => router.push(`/record/${activeConversationId}`)}
              />
            )}

            {recent.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>SENESTE SESSIONER</Text>
                {recent.map((c) => (
                  <ConversationCard
                    key={c.id}
                    conversation={c}
                    clientName={clientNameFor(c.clientId)}
                    onPress={() => openConversation(c.id, c.status)}
                  />
                ))}
              </>
            )}

            <View style={styles.clientsHeader}>
              <Text style={styles.sectionLabel}>KLIENTER</Text>
              <Pressable onPress={() => setNewClient(true)} hitSlop={8}>
                <Text style={styles.newClientLink}>＋ Ny klient</Text>
              </Pressable>
            </View>
            {clients.length > 5 && (
              <TextInput
                style={styles.search}
                value={search}
                onChangeText={setSearch}
                placeholder="Søg klient…"
                placeholderTextColor={colors.textFaint}
                selectionColor={colors.accent}
              />
            )}
          </View>
        }
        renderItem={({ item }) => {
          const count = sessionCounts[item.id] ?? 0;
          return (
            <Pressable
              style={({ pressed }) => [styles.clientRow, pressed && styles.clientRowPressed]}
              onPress={() => router.push(`/client/${item.id}`)}
            >
              <View
                style={[styles.avatar, { backgroundColor: speakerColorFor(item.colorIndex) }]}
              >
                <Text style={styles.avatarText}>
                  {item.name.trim().slice(0, 1).toUpperCase() || '?'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.clientName}>{item.name}</Text>
                <Text style={styles.clientMeta}>
                  {count === 1 ? '1 session' : `${count} sessioner`}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {q ? 'Ingen klienter matcher søgningen' : 'Ingen klienter endnu'}
              </Text>
              {!q && (
                <Text style={styles.emptyBody}>
                  Opret din første klient - så samles alle sessioner og det
                  samlede behandlingsoverblik i én mappe.
                </Text>
              )}
            </View>
          ) : null
        }
        ListFooterComponent={
          unlinked.length > 0 ? (
            <View>
              <Text style={styles.sectionLabel}>UDEN KLIENT</Text>
              <Text style={styles.unlinkedHint}>
                Ældre samtaler uden mappe. Åbn dem og vælg en klient for at
                flytte dem på plads.
              </Text>
              {unlinked.map((c) => (
                <ConversationCard
                  key={c.id}
                  conversation={c}
                  onPress={() => openConversation(c.id, c.status)}
                />
              ))}
            </View>
          ) : null
        }
        showsVerticalScrollIndicator={false}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button
          label="Ny session"
          onPress={() => setStartSession(true)}
          icon={<Text style={styles.plus}>＋</Text>}
        />
      </View>

      <NewClientModal
        visible={newClient}
        onCreate={(name) => {
          const client = createClient(name);
          setNewClient(false);
          router.push(`/client/${client.id}`);
        }}
        onClose={() => setNewClient(false)}
      />

      <ClientPickerModal
        visible={startSession}
        clients={clients}
        title="Ny session"
        subtitle="Vælg hvem sessionen handler om - eller opret en ny klient."
        onPick={(clientId) => {
          setStartSession(false);
          router.push(`/new?clientId=${clientId}`);
        }}
        onCreate={(name) => {
          const client = createClient(name);
          setStartSession(false);
          router.push(`/new?clientId=${client.id}`);
        }}
        onUnlink={() => {}}
        onClose={() => setStartSession(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  kicker: {
    color: colors.accentSoft,
    fontSize: font.size.xs,
    fontWeight: font.weight.bold,
    letterSpacing: 2,
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: font.size.display,
    fontWeight: font.weight.bold,
    letterSpacing: -1,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
    letterSpacing: 1,
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  clientsHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  newClientLink: {
    color: colors.accentSoft,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
  },
  search: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 46,
    color: colors.text,
    fontSize: font.size.md,
    marginBottom: spacing.md,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  clientRowPressed: { backgroundColor: colors.surfaceHi },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.black, fontWeight: font.weight.bold, fontSize: font.size.md },
  clientName: { color: colors.text, fontSize: font.size.md, fontWeight: font.weight.semibold },
  clientMeta: { color: colors.textMuted, fontSize: font.size.xs, marginTop: 2 },
  chevron: { color: colors.textFaint, fontSize: font.size.xl },
  empty: { paddingVertical: spacing.xl },
  emptyTitle: {
    color: colors.text,
    fontSize: font.size.md,
    fontWeight: font.weight.semibold,
    marginBottom: spacing.xs,
  },
  emptyBody: { color: colors.textMuted, fontSize: font.size.sm, lineHeight: 20 },
  unlinkedHint: {
    color: colors.textFaint,
    fontSize: font.size.sm,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  plus: { color: colors.white, fontSize: font.size.lg, fontWeight: font.weight.bold },
});
