/**
 * When a transcription is done, the audio has served its purpose: the text is
 * the documentation. Deleting the recording keeps sensitive data to a minimum
 * and stops large files piling up on the device.
 */
import { File } from 'expo-file-system';
import type { Conversation } from './types';

export async function deleteLocalAudio(conversation: Conversation): Promise<void> {
  for (const uri of [conversation.audioUri, conversation.compressedUri]) {
    if (!uri) continue;
    try {
      const file = new File(uri);
      if (file.exists) {
        file.delete();
        console.log('[audio] deleted local file after transcription', { uri });
      }
    } catch (err) {
      console.warn('[audio] could not delete local file', { uri, err: String(err) });
    }
  }
}
