import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing } from '@/theme/theme';
import { runAnalysis, getAnalysis, type AnalysisResult } from '@/lib/analysis';
import { useClients } from '@/context/ClientsContext';
import { getTranscription } from '@/lib/transcription';
import { exportJournalJson, exportJournalPdf, JOURNAL_FIELDS } from '@/lib/journalExport';
import type { Conversation } from '@/lib/types';

type AnalysisType = 'psykolog' | 'forretningsreferat' | 'interview';

const ANALYSIS_TYPES: Array<{
  id: AnalysisType;
  label: string;
  description: string;
}> = [
  {
    id: 'psykolog',
    label: 'Psykolog-notat',
    description: 'Struktureret journalnotat efter STPS vejledning',
  },
  {
    id: 'forretningsreferat',
    label: 'Møtereferring',
    description: 'Struktureret møtereferat med punkt-punkter',
  },
  {
    id: 'interview',
    label: 'Interview-analyse',
    description: 'Analyse af svarene og tema-udforskning',
  },
];

export function AnalysisSection({ conversation }: { conversation: Conversation }) {
  const cid = conversation.id;
  const { getById: getClient } = useClients();
  const client = conversation.clientId ? getClient(conversation.clientId) : undefined;

  // Track results for all types
  const [results, setResults] = useState<Record<AnalysisType, AnalysisResult | null>>({
    psykolog: null,
    forretningsreferat: null,
    interview: null,
  });

  const [running, setRunning] = useState<AnalysisType | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load existing analyses on mount
  useEffect(() => {
    let active = true;
    (async () => {
      const loaded: Record<AnalysisType, AnalysisResult | null> = {
        psykolog: null,
        forretningsreferat: null,
        interview: null,
      };

      for (const type of ['psykolog', 'forretningsreferat', 'interview'] as const) {
        const res = await getAnalysis(cid, type);
        if (active && res) loaded[type] = res;
      }

      if (active) setResults(loaded);
    })();

    return () => {
      active = false;
    };
  }, [cid]);

  const handleRun = useCallback(
    async (type: AnalysisType) => {
      setRunning(type);
      setError(null);
      try {
        const result = await runAnalysis(
          cid,
          type,
          conversation.speakerNames,
          new Date(conversation.createdAt).toISOString(),
        );
        setResults((prev) => ({ ...prev, [type]: result }));
      } catch (e: any) {
        setError(e?.message ?? 'Analysen gik i stå');
      } finally {
        setRunning(null);
      }
    },
    [cid, conversation.speakerNames, conversation.createdAt],
  );

  // Only show psykolog for now (others are placeholders)
  const psykologResult = results.psykolog;
  const psykologRunning = running === 'psykolog';

  const [exporting, setExporting] = useState<'pdf' | 'json' | null>(null);

  const handleExport = useCallback(
    async (format: 'pdf' | 'json') => {
      const analysis = results.psykolog;
      if (!analysis) return;

      setExporting(format);
      try {
        // The transcript only travels with the JSON export - the PDF is the
        // note alone, which is what belongs in a client's file.
        const segments =
          format === 'json' ? ((await getTranscription(cid))?.segments ?? undefined) : undefined;

        const input = { conversation, client, analysis, segments };
        if (format === 'pdf') await exportJournalPdf(input);
        else await exportJournalJson(input);
      } catch (e: any) {
        Alert.alert('Eksport mislykkedes', e?.message ?? 'Filen kunne ikke laves.');
      } finally {
        setExporting(null);
      }
    },
    [cid, client, conversation, results.psykolog],
  );

  return (
    <View>
      <View style={styles.typeCard}>
        <View style={styles.typeHeader}>
          <View style={styles.typeInfo}>
            <Text style={styles.typeLabel}>Psykolog-notat</Text>
            <Text style={styles.typeDescription}>
              Struktureret journalnotat efter STPS vejledning
            </Text>
          </View>
          {psykologRunning ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Pressable
              style={styles.runButton}
              onPress={() => handleRun('psykolog')}
              disabled={psykologRunning}
            >
              <Text style={styles.runButtonText}>
                {psykologResult ? 'Analyser igen' : 'Analyser'}
              </Text>
            </Pressable>
          )}
        </View>

        {error && psykologRunning === false && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {psykologResult && (
          <>
            <View style={styles.resultBox}>
              <PsykologResultDisplay result={psykologResult} />
            </View>
            <View style={styles.exportRow}>
              <Pressable
                style={styles.exportBtn}
                onPress={() => handleExport('pdf')}
                disabled={exporting !== null}
              >
                {exporting === 'pdf' ? (
                  <ActivityIndicator color={colors.accentSoft} size="small" />
                ) : (
                  <Text style={styles.exportBtnText}>Hent som PDF</Text>
                )}
              </Pressable>
              <Pressable
                style={styles.exportBtn}
                onPress={() => handleExport('json')}
                disabled={exporting !== null}
              >
                {exporting === 'json' ? (
                  <ActivityIndicator color={colors.accentSoft} size="small" />
                ) : (
                  <Text style={styles.exportBtnText}>Gem data (JSON)</Text>
                )}
              </Pressable>
            </View>
          </>
        )}

        {psykologRunning && (
          <View style={styles.processingBox}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.processingText}>Analyserer samtalen…</Text>
          </View>
        )}
      </View>

      {/* Placeholder for future analysis types */}
      <View style={styles.comingSoon}>
        <Text style={styles.comingSoonText}>
          Møtereferering og interview-analyse kommer senere
        </Text>
      </View>
    </View>
  );
}

function PsykologResultDisplay({ result }: { result: AnalysisResult }) {
  const output = result.output as Record<string, unknown>;

  const formatField = (label: string, value: unknown): string => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.join(', ');
    return JSON.stringify(value);
  };

  // The STPS fields, in the same order the PDF prints them.
  const visibleFields = JOURNAL_FIELDS.filter(({ key }) => output[key]);
  const hasRaw = Boolean(output.raw);
  const isEmpty = visibleFields.length === 0 && !hasRaw;

  if (isEmpty) {
    return (
      <View style={styles.emptyResult}>
        <Text style={styles.emptyText}>Ingen resultat fra analysen</Text>
      </View>
    );
  }

  return (
    <View>
      {visibleFields.map(({ label, key }) => {
        const value = output[key];
        return (
          <View key={key} style={styles.field}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <Text style={styles.fieldValue}>{formatField(label, value)}</Text>
          </View>
        );
      })}
      {hasRaw && (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Resultat</Text>
          <Text style={styles.fieldValue}>{String(output.raw)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  typeCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  typeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  typeInfo: { flex: 1, gap: spacing.xs },
  typeLabel: { color: colors.text, fontSize: font.size.md, fontWeight: font.weight.semibold },
  typeDescription: { color: colors.textMuted, fontSize: font.size.sm },
  runButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  runButtonText: { color: colors.accentSoft, fontSize: font.size.sm, fontWeight: font.weight.semibold },
  errorBox: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: { color: colors.textMuted, fontSize: font.size.sm },
  processingBox: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  processingText: { color: colors.textMuted, fontSize: font.size.sm },
  resultBox: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  exportRow: { flexDirection: 'row', gap: spacing.sm },
  exportBtn: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHi,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exportBtnText: { color: colors.text, fontSize: font.size.sm, fontWeight: font.weight.semibold },
  field: { marginBottom: spacing.lg, gap: spacing.xs },
  fieldLabel: { color: colors.textMuted, fontSize: font.size.xs, textTransform: 'uppercase', fontWeight: font.weight.bold },
  fieldValue: { color: colors.text, fontSize: font.size.md, lineHeight: 22 },
  emptyResult: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyText: { color: colors.textMuted, fontSize: font.size.sm },
  comingSoon: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  comingSoonText: { color: colors.textFaint, fontSize: font.size.sm, textAlign: 'center' },
});
