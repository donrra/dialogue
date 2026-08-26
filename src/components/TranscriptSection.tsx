import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, font, radius, spacing, speakerColorFor } from '@/theme/theme';
import {
  getTranscription,
  refreshTranscription,
  startTranscription,
  type TranscriptSegment,
  type TranscriptionStatus,
} from '@/lib/transcription';
import { useConversations } from '@/context/ConversationsContext';
import { formatDuration } from '@/lib/format';
import type { Conversation } from '@/lib/types';
import { SpeakerPickerModal } from './SpeakerPickerModal';

type UiStatus = TranscriptionStatus | 'loading';

export function TranscriptSection({ conversation }: { conversation: Conversation }) {
  const { update } = useConversations();
  const cid = conversation.id;
  const audioUri = conversation.audioUri;

  const [status, setStatus] = useState<UiStatus>('loading');
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [language, setLanguage] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [picker, setPicker] = useState<string | null>(null);
  const startedRef = useRef(false);

  const begin = useCallback(async () => {
    if (!audioUri) return;
    startedRef.current = true;
    setStatus('processing');
    setErrMsg(null);
    try {
      await startTranscription(cid, audioUri);
      setStatus('processing');
    } catch (e: any) {
      setStatus('error');
      setErrMsg(e?.message ?? 'Kunne ikke sende lyden til transskribering.');
    }
  }, [audioUri, cid]);

  // Initial load: resume an existing job or kick one off.
  useEffect(() => {
    let active = true;
    (async () => {
      const row = await getTranscription(cid);
      if (!active) return;
      if (!row) {
        if (!startedRef.current) begin();
        return;
      }
      setSegments(row.segments ?? []);
      setLanguage(row.language);
      setErrMsg(row.error);
      setStatus(row.status);
    })();
    return () => {
      active = false;
    };
  }, [cid, begin]);

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
    };
    const interval = setInterval(tick, 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [status, cid]);

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

  if (!audioUri) {
    return <Text style={styles.faint}>Ingen lyd at transskribere.</Text>;
  }

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
      <View style={styles.errorBox}>
        <Text style={styles.errorTitle}>Transskriberingen gik i stå</Text>
        {errMsg ? <Text style={styles.errorBody}>{errMsg}</Text> : null}
        <Pressable style={styles.retry} onPress={begin}>
          <Text style={styles.retryText}>Prøv igen</Text>
        </Pressable>
      </View>
    );
  }

  // status === 'done'
  if (segments.length === 0) {
    return (
      <View style={styles.errorBox}>
        <Text style={styles.errorTitle}>Ingen tale fundet</Text>
        <Text style={styles.errorBody}>
          Der blev ikke fundet nogen tale i optagelsen.
        </Text>
        <Pressable style={styles.retry} onPress={begin}>
          <Text style={styles.retryText}>Prøv igen</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      {language ? <Text style={styles.langHint}>Sprog: {language}</Text> : null}

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
    </View>
  );
}

const styles = StyleSheet.create({
  faint: { color: colors.textFaint, fontSize: font.size.sm },
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
  langHint: { color: colors.textFaint, fontSize: font.size.xs, marginBottom: spacing.md },
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
