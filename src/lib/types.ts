/** Core domain types for Dialogue. Shared across screens, storage and (later) the backend. */

/** A person taking part in a conversation. */
export interface Participant {
  id: string;
  name: string;
  /** Index into the speaker color palette — keeps a stable color per person. */
  colorIndex: number;
}

export type ConversationStatus =
  | 'recording' // currently being recorded
  | 'recorded' // audio captured, not yet transcribed (Fase 2)
  | 'transcribed' // text + speakers ready (Fase 2)
  | 'analyzed'; // at least one analysis done (Fase 3)

/** A recorded conversation and everything we know about it. */
export interface Conversation {
  id: string;
  title: string;
  createdAt: number; // epoch ms
  status: ConversationStatus;
  participants: Participant[];

  /** Local file URIs produced by the recorder (available after stop). */
  audioUri?: string; // primary / uncompressed (wav)
  compressedUri?: string; // smaller file used for upload later
  durationMs?: number;
  /** Size in bytes of the file we will upload. */
  fileSizeBytes?: number;

  /**
   * Maps a diarization label ("Taler 1") to a real name the user assigned.
   * Kept on the conversation so the mapping survives re-transcription.
   */
  speakerNames?: Record<string, string>;
}
