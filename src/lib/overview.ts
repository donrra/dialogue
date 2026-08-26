// Client-side API for the per-client treatment overview ("behandlingsoverblik").

import { supabase, ensureSession, edgeErrorMessage } from './supabase';

export interface OverviewResult {
  output: Record<string, unknown>;
  sessionCount: number;
  updatedAt: string;
}

export interface OverviewSessionRef {
  conversationId: string;
  /** ISO date of the session, used for chronology in the overview. */
  date?: string;
}

/** Asks the backend to (re)build the overview from the client's journal notes. */
export async function runOverview(
  clientId: string,
  clientName: string,
  sessions: OverviewSessionRef[],
): Promise<OverviewResult> {
  const uid = await ensureSession();
  if (!uid) throw new Error('Ingen forbindelse til serveren.');

  const { data, error } = await supabase.functions.invoke('analyze-overblik', {
    body: { clientId, clientName, sessions },
  });

  console.log('[overview] response from edge function:', { data, error: error?.message });
  if (error) throw new Error(await edgeErrorMessage(error));
  if (!data || !data.ok) throw new Error(data?.error ?? 'Overblikket gik i stå');

  return {
    output: data.overview || {},
    sessionCount: data.sessionCount ?? sessions.length,
    updatedAt: new Date().toISOString(),
  };
}

/** Reads the stored overview for a client, or null if none has been built yet. */
export async function getOverview(clientId: string): Promise<OverviewResult | null> {
  const uid = await ensureSession();
  if (!uid) return null;

  const { data, error } = await supabase
    .from('client_overviews')
    .select('output,session_count,updated_at')
    .eq('user_id', uid)
    .eq('client_id', clientId)
    .maybeSingle();

  if (error) {
    console.warn('[overview] fetch failed', error.message);
    return null;
  }
  if (!data) return null;

  return {
    output: data.output,
    sessionCount: data.session_count ?? 0,
    updatedAt: data.updated_at,
  };
}
