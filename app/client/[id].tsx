import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font, radius, spacing, speakerColorFor } from '@/theme/theme';
import { useClients } from '@/context/ClientsContext';
import { useConversations } from '@/context/ConversationsContext';
import { runOverview, getOverview, type OverviewResult } from '@/lib/overview';
import { formatDate } from '@/lib/format';

const OVERVIEW_FIELDS = [
  { label: 'Forløb', key: 'forlob' },
  { label: 'Temaer', key: 'temaer' },
  { label: 'Udvikling', key: 'udvikling' },
  { label: 'Opmærksomhedspunkter', key: 'opmaerksomhedspunkter' },
  { label: 'Næste skridt', key: 'naeste_skridt' },
];

export default function ClientFolderScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getById, remove } = useClients();
  const { conversations, update } = useConversations();
  const client = getById(id);

  const [overview, setOverview] = useState<OverviewResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sessions for this client, oldest first (a treatment timeline).
  const sessions = useMemo(
    () =>
      conversations
        .filter((c) => c.clientId === id)
        .sort((a, b) => a.createdAt - b.createdAt),
    [conversations, id],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await getOverview(id);
      if (active && res) setOverview(res);
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const handleRun = useCallback(async () => {
    if (!client) return;
    setRunning(true);
    setError(null);
    try {
      const result = await runOverview(
        client.id,
        client.name,
        sessions.map((s) => ({
          conversationId: s.id,
          date: new Date(s.createdAt).toISOString(),
        })),
      );
      setOverview(result);
    } catch (e: any) {
      setError(e?.message ?? 'Overblikket gik i stå');
    } finally {
      setRunning(false);
    }
  }, [client, sessions]);

  const handleDelete = () => {
    if (!client) return;
    Alert.alert(
      'Slet klient?',
      'Klienten fjernes fra registret. Samtalerne slettes ikke - de mister kun koblingen.',
      [
        { text: 'Annullér', style: 'cancel' },
        {
          text: 'Slet',
          style: 'destructive',
          onPress: () => {
            sessions.forEach((s) => update(s.id, { clientId: undefined }));
            remove(client.id);
            router.replace('/');
          },
        },
      ],
    );
  };

  if (!client) {
    return (
      <View style={styles.root}>
        <Text style={styles.missing}>Klienten blev ikke fundet.</Text>
      </View>
    );
  }

  const output = (overview?.output ?? {}) as Record<string, unknown>;
  const visibleFields = OVERVIEW_FIELDS.filter(({ key }) => output[key]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
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
        <View style={styles.titleRow}>
          <View style={[styles.avatar, { backgroundColor: speakerColorFor(client.colorIndex) }]}>
            <Text style={styles.avatarText}>
              {client.name.trim().slice(0, 1).toUpperCase() || '?'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{client.name}</Text>
            <Text style={styles.meta}>
              {sessions.length === 1 ? '1 session' : `${sessions.length} sessioner`}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Behandlingsoverblik</Text>
        <View style={styles.overviewCard}>
          <View style={styles.overviewHeader}>
            <Text style={styles.overviewHint}>
              {overview
                ? `Opdateret ${formatDate(new Date(overview.updatedAt).getTime())} · bygget på ${
                    overview.sessionCount
                  } ${overview.sessionCount === 1 ? 'notat' : 'notater'}`
                : 'Samlet billede af behandlingen på tværs af alle sessioner.'}
            </Text>
            {running ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Pressable style={styles.runButton} onPress={handleRun}>
                <Text style={styles.runButtonText}>
                  {overview ? 'Opdater' : 'Lav overblik'}
                </Text>
              </Pressable>
            )}
          </View>

          {error && !running && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {running && (
            <View style={styles.processingBox}>
              <Text style={styles.processingText}>Læser alle journalnotater…</Text>
            </View>
          )}

          {visibleFields.length > 0 && !running && (
            <View style={styles.resultBox}>
              {visibleFields.map(({ label, key }) => (
                <View key={key} style={styles.field}>
                  <Text style={styles.fieldLabel}>{label}</Text>
                  <Text style={styles.fieldValue}>{String(output[key])}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <Text style={styles.sectionLabel}>Sessioner</Text>
        {sessions.length === 0 ? (
          <Text style={styles.faint}>
            Ingen sessioner endnu. Åbn en samtale og vælg {client.name} som klient.
          </Text>
        ) : (
          <View style={styles.sessionList}>
            {sessions.map((s, i) => (
              <Pressable
                key={s.id}
                style={({ pressed }) => [styles.sessionRow, pressed && styles.sessionPressed]}
                onPress={() => router.push(`/conversation/${s.id}`)}
              >
                <Text style={styles.sessionIndex}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sessionTitle}>{s.title}</Text>
                  <Text style={styles.sessionDate}>{formatDate(s.createdAt)}</Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.black, fontWeight: font.weight.bold, fontSize: font.size.xl },
  title: {
    color: colors.text,
    fontSize: font.size.xxl,
    fontWeight: font.weight.bold,
    letterSpacing: -0.5,
  },
  meta: { color: colors.textMuted, fontSize: font.size.sm, marginTop: 2 },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.xxl,
    marginBottom: spacing.md,
  },
  overviewCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  overviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  overviewHint: { color: colors.textMuted, fontSize: font.size.sm, flex: 1, lineHeight: 20 },
  runButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  runButtonText: {
    color: colors.accentSoft,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
  },
  errorBox: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: { color: colors.textMuted, fontSize: font.size.sm },
  processingBox: { paddingVertical: spacing.sm },
  processingText: { color: colors.textMuted, fontSize: font.size.sm },
  resultBox: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  field: { marginBottom: spacing.lg, gap: spacing.xs },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: font.size.xs,
    textTransform: 'uppercase',
    fontWeight: font.weight.bold,
  },
  fieldValue: { color: colors.text, fontSize: font.size.md, lineHeight: 22 },
  faint: { color: colors.textFaint, fontSize: font.size.sm, lineHeight: 20 },
  sessionList: { gap: spacing.sm },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  sessionPressed: { backgroundColor: colors.surfaceHi },
  sessionIndex: {
    color: colors.accentSoft,
    fontSize: font.size.sm,
    fontWeight: font.weight.bold,
    width: 22,
    textAlign: 'center',
  },
  sessionTitle: { color: colors.text, fontSize: font.size.md, fontWeight: font.weight.medium },
  sessionDate: { color: colors.textMuted, fontSize: font.size.xs, marginTop: 2 },
  chevron: { color: colors.textFaint, fontSize: font.size.xl },
});
