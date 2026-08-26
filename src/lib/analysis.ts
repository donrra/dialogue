// Client-side analysis API (calls edge functions)

import { supabase, ensureSession, edgeErrorMessage } from './supabase';

export type AnalysisType = 'psykolog' | 'forretningsreferat' | 'interview';

export interface AnalysisResult {
  type: AnalysisType;
  output: Record<string, unknown>;
  createdAt: string;
  error?: string;
}

export async function runAnalysis(
  conversationId: string,
  type: AnalysisType,
  speakerNames?: Record<string, string>,
): Promise<AnalysisResult> {
  const uid = await ensureSession();
  if (!uid) throw new Error('Ingen forbindelse til serveren.');

  const fnName = `analyze-${type}`;
  const { data, error } = await supabase.functions.invoke(fnName, {
    body: { conversationId, speakerNames },
  });

  console.log('[analysis] response from edge function:', { fnName, data, error: error?.message });
  if (error) throw new Error(await edgeErrorMessage(error));
  if (!data || !data.ok) throw new Error(data?.error ?? 'Analysen gik i stå');

  return {
    type,
    output: data.analysis || {},
    createdAt: new Date().toISOString(),
  };
}

export async function getAnalysis(
  conversationId: string,
  type: AnalysisType,
): Promise<AnalysisResult | null> {
  const uid = await ensureSession();
  if (!uid) return null;

  const { data, error } = await supabase
    .from('analyses')
    .select('output,created_at,error,type')
    .eq('user_id', uid)
    .eq('conversation_id', conversationId)
    .eq('type', type)
    .maybeSingle();

  if (error) {
    console.warn('[analysis] fetch failed', error.message);
    return null;
  }

  if (!data) return null;

  return {
    type: data.type as AnalysisType,
    output: data.output,
    createdAt: data.created_at,
    error: data.error || undefined,
  };
}
