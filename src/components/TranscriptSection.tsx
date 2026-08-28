import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, font, radius, spacing, speakerColorFor } from '@/theme/theme';
import {
  audioDaysLeft,
  getTranscription,
  refreshTranscription,
  retranscribe,
  startTranscription,
  type TranscriptSegment,
  type TranscriptionStatus,
} from '@/lib/transcription';
import { DEFAULT_LANGUAGES, languageSummary } from '@/lib/languages';
import { LanguagePickerModal } from './LanguagePickerModal';
import { useConversations } from '@/context/ConversationsContext';
import { useClients } from '@/context/ClientsContext';
import { deleteLocalAudio } from '@/lib/audioCleanup';
import { formatDuration } from '@/lib/format';
import type { Conversation } from '@/lib/types';
import { SpeakerPickerModal } from './SpeakerPickerModal';

type UiStatus = TranscriptionStatus | 'loading';

export function TranscriptSection({ conversation }: { conversation: Conversation }) {
  const { update } = useConversations();
  const { getById: getClient, update: updateClient } = useClients();
  const cid = conversation.id;
  const audioUri = conversation.audioUri;

  // Names that will be said out loud, handed to the speech engine as a small
  // dictionary so it stops guessing at them. The client's name matters most —
  // it turns up again and again in a session.
  const clientName = conversation.clientId
    ? getClient(conversation.clientId)?.name
    : undefined;
  const vocabulary = useMemo(() => {
    const names = conversation.participants.map((p) => p.name);
    if (clientName) names.push(clientName);
    return names.filter((n) => n.trim().length > 1);
  }, [conversation.participants, clientName]);
  const expectedSpeakers = conversation.participants.length;

  const [status, setStatus] = useState<UiStatus>('loading');
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [language, setLanguage] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [picker, setPicker] = useState<string | null>(null);
  const [langPicker, setLangPicker] = useState(false);
  /** Storage path of the recording, or null once it has been swept. */
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const startedRef = useRef(false);

  const languages = conversation.languages ?? DEFAULT_LANGUAGES;

  const begin = useCallback(async () => {
    if (!audioUri) return;
    startedRef.current = true;
    setStatus('processing');
    setErrMsg(null);
    try {
      await startTranscription(cid, audioUri, {
        languages,
        vocabulary,
        expectedSpeakers,
      });
      setStatus('processing');
    } catch (e: any) {
      setStatus('error');
      setErrMsg(e?.message ?? 'Kunne ikke sende lyden til transskribering.');
    }
  }, [audioUri, cid, languages, vocabulary, expectedSpeakers]);

  /**
   * Runs the transcription again on the copy still held on the server, with the
   * languages the user just picked. This is the whole point of keeping the
   * recording around: a wrong transcript is fixable instead of final.
   */
  const runAgain = useCallback(
    async (nextLanguages: string[]) => {
      setLangPicker(false);
      update(cid, { languages: nextLanguages });
      // Correcting the languages here is also a correction of the client: if
      // this session turned out to be Danish plus Urdu, the next one will be
      // too. Saves discovering the same thing again next week.
      if (conversation.clientId) {
        updateClient(conversation.clientId, { languages: nextLanguages });
      }
      if (!audioPath) return;
      setStatus('processing');
      setSegments([]);
      setErrMsg(null);
      try {
        await retranscribe(cid, audioPath, {
          languages: nextLanguages,
          vocabulary,
          expectedSpeakers,
        });
      } catch (e: any) {
        setStatus('error');
        setErrMsg(e?.message ?? 'Kunne ikke starte transskriberingen igen.');
      }
    },
    [audioPath, cid, update, updateClient, conversation.clientId, vocabulary, expectedSpeakers],
  );

  // Initial load: resume an existing job or kick one off.
  useEffect(() => {
    let active = true;
    (async () => {
      const row = await getTranscription(cid);
      if (!active) return;
      if (!row) {
        if (audioUri) {
          if (!startedRef.current) begin();
        } else {
          setStatus('error');
          setErrMsg('Ingen lyd at transskribere.');
        }
        return;
      }
      setSegments(row.segments ?? []);
      setLanguage(row.language);
      setErrMsg(row.error);
      setStatus(row.status);
      setAudioPath(row.audio_path);
      setCreatedAt(row.created_at);
      // The phone's copy is no longer needed - the server keeps one so the
      // transcript can be run again.
      if (row.status === 'done' && audioUri) {
        await deleteLocalAudio(conversation);
        update(cid, { audioUri: undefined, compressedUri: undefined });
      }
    })();
    return () => {
      active = false;
    };
  }, [cid, begin, audioUri, conversation, update]);

  // Poll while the job is in flight.
  useEffect(() => {
    const inFlight = status === 'processing' || status === 'pending' || status === 'uploading';
    if (!inFlight) return;
    let active = true;
    const tick = async () => {
      const p = await refreshTranscription(cid);
      if (!active || !p) return;
      if (p.segments) setSegments(p.segments);
      if (p.language != null) setLanguage(p.language);
      if (p.error) setErrMsg(p.error);
      setStatus(p.status);
      if (p.audioPath !== undefined) setAudioPath(p.audioPath);
      // Done: mark the conversation transcribed and drop the phone's copy. The
      // server keeps its own until the retention window runs out.
      if (p.status === 'done') {
        await deleteLocalAudio(conversation);
        update(cid, {
          status: 'transcribed',
          audioUri: undefined,
          compressedUri: undefined,
        });
      }
    };
    const interval = setInterval(tick, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [status, cid, update]);

  // Stable color per distinct speaker label, in order of appearance.
  const speakerColorIndex = useMemo(() => {
    const map: Record<string, number> = {};
    let n = 0;
    for (const s of segments) if (!(s.speaker in map)) map[s.speaker] = n++;
    return map;
  }, [segments]);

  const displayName = (label: string) => conversation.speakerNames?.[label] ?? label;

  const assignSpeaker = (label: string, name: string | null) => {
    Haptics.selectionAsync();
    const next = { ...(conversation.speakerNames ?? {}) };
    if (name) next[label] = name;
    else delete next[label];
    update(cid, { speakerNames: next });
    setPicker(null);
  };

  // How long the recording is still available to run again.
  const daysLeft = audioDaysLeft(createdAt);
  const canRerun = !!audioPath;
  const retentionNote = !canRerun
    ? 'Lyden er slettet, så teksten kan ikke laves om.'
    : daysLeft === 0
      ? 'Lyden slettes ved din næste optagelse.'
      : daysLeft === 1
        ? 'Lyden gemmes endnu 1 dag, så du kan lave teksten om.'
        : `Lyden gemmes endnu ${daysLeft} dage, så du kan lave teksten om.`;

  /**
   * The single most useful control on this screen: the transcript is only as
   * good as the languages the engine was told to expect, and this is where the
   * user corrects that and tries again.
   */
  const languageBar = (
    <View style={styles.langBox}>
      <View style={styles.langRow}>
        <View style={styles.langTextCol}>
          <Text style={styles.langLabel}>Talt sprog</Text>
          <Text style={styles.langValue}>{languageSummary(languages)}</Text>
        </View>
        {canRerun ? (
          <Pressable
            style={({ pressed }) => [styles.langButton, pressed && styles.langButtonPressed]}
            onPress={() => {
              Haptics.selectionAsync();
              setLangPicker(true);
            }}
          >
            <Text style={styles.langButtonText}>Lav teksten om</Text>
          </Pressable>
        ) : null}
      </View>
      {languages.length > 1 && language ? (
        <Text style={styles.langNote}>
          Fundet i optagelsen: {language}. Passer det ikke, så vælg færre sprog.
        </Text>
      ) : null}
      <Text style={styles.langNote}>{retentionNote}</Text>
    </View>
  );

  const langModal = (
    <LanguagePickerModal
      visible={langPicker}
      selected={languages}
      onConfirm={runAgain}
      onClose={() => setLangPicker(false)}
    />
  );

  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (status === 'processing' || status === 'pending' || status === 'uploading') {
    return (
      <View style={styles.processing}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.processingTitle}>Laver tekst…</Text>
        <Text style={styles.processingBody}>
          Lyden bliver skrevet ud og delt op efter hvem der taler. Det kan tage et
          øjeblik — du kan roligt forlade skærmen, den arbejder videre.
        </Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View>
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Transskriberingen gik i stå</Text>
          {errMsg ? <Text style={styles.errorBody}>{errMsg}</Text> : null}
          {audioUri || canRerun ? (
            <Pressable
              style={styles.retry}
              onPress={() => (audioUri ? begin() : runAgain(languages))}
            >
              <Text style={styles.retryText}>Prøv igen</Text>
            </Pressable>
          ) : null}
        </View>
        {languageBar}
        {langModal}
      </View>
    );
  }

  // status === 'done'
  if (segments.length === 0) {
    return (
      <View>
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Ingen tale fundet</Text>
          <Text style={styles.errorBody}>
            Der blev ikke fundet nogen tale i optagelsen. Er der talt et andet
            sprog end det valgte, kan du rette det og lave teksten om.
          </Text>
          {audioUri ? (
            <Pressable style={styles.retry} onPress={begin}>
              <Text style={styles.retryText}>Prøv igen</Text>
            </Pressable>
          ) : null}
        </View>
        {languageBar}
        {langModal}
      </View>
    );
  }

  return (
    <View>
      {languageBar}
      <Text style={styles.hintText}>💡 Klik på "Taler 1" eller "Taler 2" for at linke til deltagernes navne</Text>

      <View style={styles.thread}>
        {segments.map((seg, i) => {
          const color = speakerColorFor(speakerColorIndex[seg.speaker] ?? 0);
          const prev = segments[i - 1];
          const sameAsPrev = prev && prev.speaker === seg.speaker;
          return (
            <View key={i} style={styles.segment}>
              {!sameAsPrev && (
                <Pressable
                  style={styles.speakerRow}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setPicker(seg.speaker);
                  }}
                >
                  <View style={[styles.dot, { backgroundColor: color }]} />
                  <Text style={[styles.speakerName, { color }]}>{displayName(seg.speaker)}</Text>
                  <Text style={styles.editHint}>· skift navn</Text>
                  <Text style={styles.time}>{formatDuration(seg.start * 1000)}</Text>
                </Pressable>
              )}
              <View style={[styles.bubble, { borderLeftColor: color }]}>
                <Text style={styles.bubbleText}>{seg.text}</Text>
              </View>
            </View>
          );
        })}
      </View>

      <SpeakerPickerModal
        visible={picker !== null}
        speakerLabel={picker}
        participants={conversation.participants}
        onPick={(name) => picker && assignSpeaker(picker, name)}
        onReset={() => picker && assignSpeaker(picker, null)}
        onClose={() => setPicker(null)}
      />
      {langModal}
    </View>
  );
}

const styles = StyleSheet.create({
  faint: { color: colors.textFaint, fontSize: font.size.sm },
  hintText: { color: colors.textMuted, fontSize: font.size.sm, marginBottom: spacing.md, fontStyle: 'italic' },
  center: { paddingVertical: spacing.xl, alignItems: 'center' },
  processing: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  processingTitle: { color: colors.text, fontSize: font.size.md, fontWeight: font.weight.semibold },
  processingBody: { color: colors.textMuted, fontSize: font.size.sm, textAlign: 'center', lineHeight: 20 },
  errorBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  errorTitle: { color: colors.text, fontSize: font.size.md, fontWeight: font.weight.semibold },
  errorBody: { color: colors.textMuted, fontSize: font.size.sm, lineHeight: 20 },
  retry: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  retryText: { color: colors.accentSoft, fontSize: font.size.sm, fontWeight: font.weight.semibold },
  langBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  langRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  langTextCol: { flex: 1 },
  langLabel: { color: colors.textFaint, fontSize: font.size.xs },
  langValue: { color: colors.text, fontSize: font.size.md, fontWeight: font.weight.semibold },
  langButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  langButtonPressed: { backgroundColor: colors.surfacePressed },
  langButtonText: { color: colors.accentSoft, fontSize: font.size.sm, fontWeight: font.weight.semibold },
  langNote: { color: colors.textMuted, fontSize: font.size.xs, lineHeight: 17 },
  thread: { gap: spacing.md },
  segment: { gap: spacing.xs },
  speakerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  speakerName: { fontSize: font.size.sm, fontWeight: font.weight.bold },
  editHint: { color: colors.textFaint, fontSize: font.size.xs },
  time: { color: colors.textFaint, fontSize: font.size.xs, marginLeft: 'auto', fontVariant: ['tabular-nums'] },
  bubble: {
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  bubbleText: { color: colors.text, fontSize: font.size.md, lineHeight: 23 },
});
