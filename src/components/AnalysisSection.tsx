import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, font, radius, spacing } from '@/theme/theme';
import { runAnalysis, getAnalysis, type AnalysisResult } from '@/lib/analysis';
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
        const result = await runAnalysis(cid, type, conversation.speakerNames);
        setResults((prev) => ({ ...prev, [type]: result }));
      } catch (e: any) {
        setError(e?.message ?? 'Analysen gik i stå');
      } finally {
        setRunning(null);
      }
    },
    [cid, conversation.speakerNames],
  );

  // Only show psykolog for now (others are placeholders)
  const psykologResult = results.psykolog;
  const psykologRunning = running === 'psykolog';

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
          <View style={styles.resultBox}>
            <PsykologResultDisplay result={psykologResult} />
          </View>
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

  // Display STPS-compliant fields
  const fields = [
    { label: 'Dato', key: 'datum' },
    { label: 'Deltagere', key: 'deltagere' },
    { label: 'Planlagt behandling', key: 'planlagt_behandling' },
    { label: 'Udført behandling', key: 'udfort_behandling' },
    { label: 'Tilstand', key: 'tilstand' },
    { label: 'Respons på behandling', key: 'respons' },
    { label: 'Observationer', key: 'observationer' },
    { label: 'Opfølgning', key: 'opfolging' },
  ];

  const visibleFields = fields.filter(({ key }) => output[key]);
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
