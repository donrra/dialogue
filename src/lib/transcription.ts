/**
 * Client side of the transcription pipeline.
 *
 * Flow: upload the recorded audio to Supabase Storage → create a `transcriptions`
 * row → invoke the `transcribe` edge function (which calls Gladia server-side so
 * the API key never touches the device). The app then polls `getTranscription`
 * until the status is `done` or `error`.
 */
import { File } from 'expo-file-system';
import { supabase, ensureSession, edgeErrorMessage } from './supabase';

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
  /** 0-1 certainty from Gladia; low values mark passages worth re-reading. */
  confidence?: number;
}

/** Extra context that measurably improves the transcript. */
export interface TranscriptionOptions {
  /**
   * ISO codes of the languages actually spoken. One code means the engine is
   * pinned to it (most accurate); several means it may switch between them, and
   * only them. Defaults to Danish server-side.
   */
  languages?: string[];
  /** Names said out loud in the session — Gladia gets them right instead of guessing. */
  vocabulary?: string[];
  /** How many people are in the room, when we know it from the participant list. */
  expectedSpeakers?: number;
}

export interface TranscriptionRow {
  conversation_id: string;
  status: TranscriptionStatus;
  language: string | null;
  segments: TranscriptSegment[];
  error: string | null;
  duration_ms: number | null;
  /** Where the recording lives, or null once it has been deleted. */
  audio_path: string | null;
  created_at: string | null;
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
  options: TranscriptionOptions = {},
): Promise<void> {
  const uid = await ensureSession();
  if (!uid) throw new Error('Ingen forbindelse til serveren. Prøv igen.');

  const path = pathFor(uid, conversationId);

  // 1) Upload the compressed audio file.
  const bytes = await new File(audioUri).bytes();
  console.log('[transcription] uploading audio', { conversationId, bytes: bytes.length });
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'audio/mp4', upsert: true });
  if (upErr) {
    console.warn('[transcription] upload failed', { conversationId, message: upErr.message });
    throw new Error(`Upload af lyden fejlede: ${upErr.message}`);
  }

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
  if (rowErr) {
    console.warn('[transcription] status row failed', { conversationId, message: rowErr.message });
    throw new Error(`Kunne ikke gemme transskriptions-status: ${rowErr.message}`);
  }

  // 3) Ask the backend to transcribe (it talks to Gladia and the callback fills
  //    in the result). The user's JWT is attached automatically.
  const { error: fnErr } = await supabase.functions.invoke('transcribe', {
    body: {
      conversationId,
      path,
      languages: options.languages,
      vocabulary: options.vocabulary,
      expectedSpeakers: options.expectedSpeakers,
    },
  });
  if (fnErr) {
    const msg = await edgeErrorMessage(fnErr);
    console.warn('[transcription] transcribe function failed', { conversationId, message: msg });
    throw new Error(msg);
  }
  console.log('[transcription] started', { conversationId });
}

/**
 * Runs the transcription again on the recording already on the server, with
 * whatever settings the user has changed - normally the languages. Nothing is
 * re-uploaded; the phone's own copy is long gone by this point.
 *
 * Only possible while the recording is inside its retention window. Once it has
 * been swept, the text is all that is left.
 */
export async function retranscribe(
  conversationId: string,
  audioPath: string,
  options: TranscriptionOptions = {},
): Promise<void> {
  const uid = await ensureSession();
  if (!uid) throw new Error('Ingen forbindelse til serveren. Prøv igen.');

  const { error: fnErr } = await supabase.functions.invoke('transcribe', {
    body: {
      conversationId,
      path: audioPath,
      languages: options.languages,
      vocabulary: options.vocabulary,
      expectedSpeakers: options.expectedSpeakers,
    },
  });
  if (fnErr) {
    const msg = await edgeErrorMessage(fnErr);
    console.warn('[transcription] retranscribe failed', { conversationId, message: msg });
    throw new Error(msg);
  }
  console.log('[transcription] re-running', { conversationId, languages: options.languages });
}

/**
 * How long a recording is kept after transcription so it can be run again.
 * Mirrors AUDIO_RETENTION_DAYS in the `transcribe` edge function.
 */
export const AUDIO_RETENTION_DAYS = 7;

/** Whole days left before the recording is deleted, or 0 once it is due. */
export function audioDaysLeft(createdAt: string | null | undefined): number {
  if (!createdAt) return 0;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return 0;
  const elapsedDays = (Date.now() - created) / (24 * 60 * 60 * 1000);
  return Math.max(0, Math.ceil(AUDIO_RETENTION_DAYS - elapsedDays));
}

/** Reads the current transcription state for a conversation, or null if none yet. */
export async function getTranscription(
  conversationId: string,
): Promise<TranscriptionRow | null> {
  const uid = await ensureSession();
  if (!uid) return null;
  const { data, error } = await supabase
    .from('transcriptions')
    .select('conversation_id,status,language,segments,error,duration_ms,audio_path,created_at')
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
  /** Null once the recording has passed its retention window. */
  audioPath?: string | null;
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
    console.warn('[transcription] status check failed', await edgeErrorMessage(error));
    return null;
  }
  return data as TranscriptionProgress;
}
