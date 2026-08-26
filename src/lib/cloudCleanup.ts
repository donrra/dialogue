/**
 * When the user deletes a session or a client folder, the cloud copies must go
 * with it - otherwise transcripts and journal notes would linger as orphans.
 * All deletes are owner-scoped; RLS blocks anything else.
 */
import { supabase, ensureSession } from './supabase';

/** Deletes transcript, analyses and any leftover audio for one conversation. */
export async function deleteConversationCloudData(conversationId: string): Promise<void> {
  const uid = await ensureSession();
  if (!uid) return;
  try {
    await supabase
      .from('analyses')
      .delete()
      .eq('user_id', uid)
      .eq('conversation_id', conversationId);
    await supabase
      .from('transcriptions')
      .delete()
      .eq('user_id', uid)
      .eq('conversation_id', conversationId);
    // Audio is normally already gone after transcription; this catches the
    // cases where a session is deleted before that happens.
    await supabase.storage.from('recordings').remove([`${uid}/${conversationId}.m4a`]);
    console.log('[cleanup] cloud data deleted', { conversationId });
  } catch (err) {
    console.warn('[cleanup] cloud delete failed', { conversationId, err: String(err) });
  }
}

/** Deletes the stored treatment overview for a client. */
export async function deleteOverviewCloudData(clientId: string): Promise<void> {
  const uid = await ensureSession();
  if (!uid) return;
  try {
    await supabase
      .from('client_overviews')
      .delete()
      .eq('user_id', uid)
      .eq('client_id', clientId);
    console.log('[cleanup] overview deleted', { clientId });
  } catch (err) {
    console.warn('[cleanup] overview delete failed', { clientId, err: String(err) });
  }
}
