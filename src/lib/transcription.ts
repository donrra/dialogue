/**
 * Client side of the transcription pipeline.
 *
 * Flow: upload the recorded audio to Supabase Storage → create a `transcriptions`
 * row → invoke the `transcribe` edge function (which calls Gladia server-side so
 * the API key never touches the device). The app then polls `getTranscription`
 * until the status is `done` or `error`.
 */
import { File } from 'expo-file-system';
import { supabase, ensureSession } from './supabase';

export type TranscriptionStatus =
  | 'pending'
  | 'uploading'
  | 'processing'
  | 'done'
  | 'error';

export interface TranscriptSegment {
  /** Diarization label from Gladia, e.g. "Taler 1". Mapped to a real name in the UI. */
  speaker: string;
  text: string;
  /** Seconds from the start of the recording. */
  start: number;
  end: number;
  language?: string;
}

export interface TranscriptionRow {
  conversation_id: string;
  status: TranscriptionStatus;
  language: string | null;
  segments: TranscriptSegment[];
  error: string | null;
  duration_ms: number | null;
}

const BUCKET = 'recordings';

function pathFor(uid: string, conversationId: string): string {
  return `${uid}/${conversationId}.m4a`;
}

/**
 * Uploads the audio and kicks off transcription. Throws on failure so the caller
 * can show a retry affordance — the recording itself is already safe locally.
 */
export async function startTranscription(
  conversationId: string,
  audioUri: string,
): Promise<void> {
  const uid = await ensureSession();
  if (!uid) throw new Error('Ingen forbindelse til serveren. Prøv igen.');

  const path = pathFor(uid, conversationId);

  // 1) Upload the compressed audio file.
  const bytes = await new File(audioUri).bytes();
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'audio/mp4', upsert: true });
  if (upErr) throw upErr;

  // 2) Mark a transcription as in-progress (so the UI can show a spinner).
  const { error: rowErr } = await supabase.from('transcriptions').upsert(
    {
      user_id: uid,
      conversation_id: conversationId,
      audio_path: path,
      status: 'processing',
      segments: [],
      error: null,
    },
    { onConflict: 'user_id,conversation_id' },
  );
  if (rowErr) throw rowErr;

  // 3) Ask the backend to transcribe (it talks to Gladia and the callback fills
  //    in the result). The user's JWT is attached automatically.
  const { error: fnErr } = await supabase.functions.invoke('transcribe', {
    body: { conversationId, path },
  });
  if (fnErr) throw fnErr;
}

/** Reads the current transcription state for a conversation, or null if none yet. */
export async function getTranscription(
  conversationId: string,
): Promise<TranscriptionRow | null> {
  const uid = await ensureSession();
  if (!uid) return null;
  const { data, error } = await supabase
    .from('transcriptions')
    .select('conversation_id,status,language,segments,error,duration_ms')
    .eq('user_id', uid)
    .eq('conversation_id', conversationId)
    .maybeSingle();
  if (error) {
    console.warn('[transcription] fetch failed', error.message);
    return null;
  }
  return (data as TranscriptionRow | null) ?? null;
}

export interface TranscriptionProgress {
  status: TranscriptionStatus;
  segments: TranscriptSegment[];
  language?: string | null;
  error?: string | null;
}

/**
 * Advances a processing job: asks the backend (which polls Gladia) for the
 * latest result and persists it when finished. Call on a timer while processing.
 */
export async function refreshTranscription(
  conversationId: string,
): Promise<TranscriptionProgress | null> {
  await ensureSession();
  const { data, error } = await supabase.functions.invoke('transcription-status', {
    body: { conversationId },
  });
  if (error) {
    console.warn('[transcription] status check failed', error.message);
    return null;
  }
  return data as TranscriptionProgress;
}
