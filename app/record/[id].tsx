import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors, font, radius, spacing } from '@/theme/theme';
import { useConversations } from '@/context/ConversationsContext';
import { useRecording } from '@/context/RecordingContext';
import { ParticipantChip } from '@/components/ParticipantChip';
import { RecordButton } from '@/components/RecordButton';
import { WaveBars } from '@/components/WaveBars';
import { ScreenOffOverlay } from '@/components/ScreenOffOverlay';
import { formatDuration } from '@/lib/format';
import { makeId } from '@/lib/id';

export default function RecordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, autostart } = useLocalSearchParams<{ id: string; autostart?: string }>();
  const { getById, update, remove } = useConversations();
  const recording = useRecording();

  const conversation = getById(id);
  const isThisActive = recording.activeConversationId === id;
  const live = isThisActive && recording.isRecording;
  const paused = isThisActive && recording.isPaused;

  const [screenOff, setScreenOff] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [stopping, setStopping] = useState(false);
  const startedRef = useRef(false);

  // `cameFromAutostart` lets us clean up an empty conversation if the very first
  // start attempt fails (so it doesn't linger in the list as "Optager").
  const beginRecording = useCallback(
    async (cameFromAutostart = false) => {
      if (startedRef.current) return;
      startedRef.current = true;
      const outcome = await recording.start(id);
      if (outcome.ok) return;

      startedRef.current = false;

      if (outcome.reason === 'mic') {
        const onDismiss = cameFromAutostart
          ? () => {
              remove(id);
              router.replace('/');
            }
          : undefined;
        if (outcome.canAskAgain) {
          Alert.alert(
            'Mikrofon-adgang nødvendig',
            'Dialogue skal bruge mikrofonen for at optage samtalen. Tryk på optage-knappen igen og vælg "Tillad".',
            [{ text: 'OK', onPress: onDismiss }],
          );
        } else {
          Alert.alert(
            'Mikrofon-adgang er slået fra',
            'Giv Dialogue adgang til mikrofonen i telefonens indstillinger, så kan du optage.',
            [
              { text: 'Ikke nu', style: 'cancel', onPress: onDismiss },
              { text: 'Åbn indstillinger', onPress: () => Linking.openSettings() },
            ],
          );
        }
      } else {
        Alert.alert(
          'Kunne ikke starte optagelsen',
          `Der opstod en teknisk fejl:\n\n${outcome.message}`,
          [
            {
              text: 'OK',
              onPress: cameFromAutostart
                ? () => {
                    remove(id);
                    router.replace('/');
                  }
                : undefined,
            },
          ],
        );
      }
    },
    [id, recording, remove, router],
  );

  // Auto-start when arriving straight from the "new conversation" flow.
  useEffect(() => {
    if (autostart === '1' && !isThisActive && !startedRef.current) {
      beginRecording(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStop = () => {
    Alert.alert('Afslut samtale?', 'Optagelsen stoppes og samtalen gemmes.', [
      { text: 'Fortsæt optagelse', style: 'cancel' },
      {
        text: 'Afslut',
        style: 'destructive',
        onPress: async () => {
          setStopping(true);
          const result = await recording.stop();
          update(id, {
            status: 'recorded',
            audioUri: result?.audioUri,
            compressedUri: result?.audioUri,
            durationMs: result?.durationMs ?? recording.durationMs,
            fileSizeBytes: result?.fileSizeBytes,
          });
          router.replace(`/conversation/${id}`);
        },
      },
    ]);
  };

  const togglePause = () => {
    if (paused) recording.resume();
    else recording.pause();
  };

  const addParticipant = () => {
    const trimmed = newName.trim();
    if (!trimmed || !conversation) return;
    Haptics.selectionAsync();
    update(id, {
      participants: [
        ...conversation.participants,
        { id: makeId('p_'), name: trimmed, colorIndex: conversation.participants.length },
      ],
    });
    setNewName('');
    setShowAdd(false);
  };

  const handleBack = () => {
    if (live || paused) {
      Alert.alert(
        'Optagelse kører',
        'Vil du lade optagelsen fortsætte i baggrunden? Den stopper først når du afslutter samtalen.',
        [
          { text: 'Bliv her', style: 'cancel' },
          { text: 'Fortsæt i baggrunden', onPress: () => router.back() },
        ],
      );
    } else {
      router.back();
    }
  };

  if (!conversation) {
    return (
      <View style={styles.root}>
        <Text style={styles.missing}>Samtalen blev ikke fundet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={handleBack} hitSlop={12} style={styles.iconBtn}>
          <Text style={styles.iconText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {conversation.title}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.timerBlock}>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: live ? colors.record : colors.textFaint },
            ]}
          />
          <Text style={styles.statusText}>
            {live ? 'Optager' : paused ? 'På pause' : 'Klar'}
          </Text>
        </View>
        <Text style={styles.timer}>{formatDuration(recording.durationMs)}</Text>
        <WaveBars active={live} color={colors.record} bars={7} />
      </View>

      <View style={styles.participantsBlock}>
        <View style={styles.participantsHeader}>
          <Text style={styles.sectionLabel}>
            Deltagere ({conversation.participants.length})
          </Text>
          <Pressable onPress={() => setShowAdd((s) => !s)} hitSlop={8}>
            <Text style={styles.addLink}>{showAdd ? 'Annullér' : '＋ Tilføj'}</Text>
          </Pressable>
        </View>

        {showAdd && (
          <View style={styles.addRow}>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              autoFocus
              style={styles.addInput}
              placeholder="Navn på deltager"
              placeholderTextColor={colors.textFaint}
              selectionColor={colors.accent}
              onSubmitEditing={addParticipant}
              returnKeyType="done"
            />
            <Pressable onPress={addParticipant} style={styles.addConfirm}>
              <Text style={styles.addConfirmText}>Tilføj</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.chips}>
          {conversation.participants.length === 0 ? (
            <Text style={styles.noParticipants}>
              Ingen deltagere endnu — tilføj dem her.
            </Text>
          ) : (
            conversation.participants.map((p) => (
              <ParticipantChip key={p.id} participant={p} />
            ))
          )}
        </View>
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.lg }]}>
        {(live || paused) && (
          <View style={styles.secondaryRow}>
            <Pressable style={styles.secondaryBtn} onPress={togglePause}>
              <Text style={styles.secondaryText}>{paused ? '▶  Genoptag' : '❚❚  Pause'}</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setScreenOff(true);
              }}
            >
              <Text style={styles.secondaryText}>◐  Sluk skærm</Text>
            </Pressable>
          </View>
        )}

        {live || paused ? (
          <RecordButton recording onPress={handleStop} />
        ) : (
          <RecordButton recording={false} onPress={() => beginRecording(false)} />
        )}

        {(live || paused) && (
          <Text style={styles.bgNote}>
            Optagelsen fortsætter med slukket skærm, og selv hvis du forlader appen.
            Den stopper først, når du afslutter samtalen.
          </Text>
        )}
      </View>

      <ScreenOffOverlay
        visible={screenOff}
        durationMs={recording.durationMs}
        onWake={() => setScreenOff(false)}
      />

      {stopping && (
        <View style={styles.stopOverlay}>
          <Text style={styles.stopText}>Gemmer samtale…</Text>
        </View>
      )}
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
    paddingBottom: spacing.md,
  },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  iconText: { color: colors.text, fontSize: 30, lineHeight: 30 },
  headerTitle: {
    color: colors.text,
    fontSize: font.size.md,
    fontWeight: font.weight.semibold,
    flex: 1,
    textAlign: 'center',
  },
  timerBlock: { alignItems: 'center', paddingTop: spacing.xxl, gap: spacing.lg },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  timer: {
    color: colors.text,
    fontSize: 72,
    fontWeight: font.weight.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
  },
  participantsBlock: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
  },
  participantsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
  },
  addLink: { color: colors.accentSoft, fontSize: font.size.sm, fontWeight: font.weight.semibold },
  addRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  addInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 48,
    color: colors.text,
    fontSize: font.size.md,
  },
  addConfirm: {
    paddingHorizontal: spacing.lg,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addConfirmText: { color: colors.white, fontWeight: font.weight.semibold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  noParticipants: { color: colors.textFaint, fontSize: font.size.sm },
  controls: { paddingHorizontal: spacing.xl, alignItems: 'center', gap: spacing.lg },
  secondaryRow: { flexDirection: 'row', gap: spacing.md },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  secondaryText: { color: colors.text, fontSize: font.size.sm, fontWeight: font.weight.medium },
  bgNote: {
    color: colors.textFaint,
    fontSize: font.size.xs,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: spacing.lg,
  },
  stopOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(11,11,18,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopText: { color: colors.text, fontSize: font.size.md, fontWeight: font.weight.medium },
});
