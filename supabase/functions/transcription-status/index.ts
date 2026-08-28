// Edge function: poll Gladia for a transcription's result and store it when done.
// The app calls this every few seconds while a transcription is processing.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

interface GladiaChunk {
  speaker?: number;
  /** `utterances` carry `text`; `sentences` carry `sentence`. */
  text?: string;
  sentence?: string;
  start?: number;
  end?: number;
  language?: string;
  confidence?: number;
}

interface Segment {
  speaker: string;
  text: string;
  start: number;
  end: number;
  language?: string;
  /** 0-1 from Gladia. Lets the app flag passages worth re-reading. */
  confidence?: number;
}

/**
 * Normalises whatever Gladia returned into the app's segment shape.
 * We ask for `sentences: true`, which groups speech into whole sentences instead
 * of the short fragments `utterances` produces: much easier to read, and better
 * context for the analysis. Utterances stay as the fallback.
 */
function toSegments(chunks: GladiaChunk[]): Segment[] {
  return chunks
    .map((c) => ({
      speaker:
        typeof c.speaker === 'number' && c.speaker >= 0
          ? `Taler ${c.speaker + 1}`
          : 'Ukendt',
      text: (c.sentence ?? c.text ?? '').trim(),
      start: c.start ?? 0,
      end: c.end ?? 0,
      language: c.language,
      confidence: typeof c.confidence === 'number' ? c.confidence : undefined,
    }))
    .filter((s) => s.text.length > 0);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { conversationId } = await req.json();
    if (!conversationId) return json({ error: 'missing conversationId' }, 400);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const GLADIA_KEY = Deno.env.get('GLADIA_API_KEY');
    if (!GLADIA_KEY) return json({ error: 'GLADIA_API_KEY not configured' }, 500);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: row } = await admin
      .from('transcriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('conversation_id', conversationId)
      .maybeSingle();

    if (!row) return json({ status: 'pending', segments: [] });
    // Already settled: return the stored result.
    if (row.status === 'done' || row.status === 'error') {
      return json({
        status: row.status,
        segments: row.segments ?? [],
        language: row.language,
        error: row.error,
        audioPath: row.audio_path,
      });
    }
    if (!row.gladia_id) return json({ status: row.status, segments: [] });

    // Ask Gladia where the job is.
    const r = await fetch(`https://api.gladia.io/v2/pre-recorded/${row.gladia_id}`, {
      headers: { 'x-gladia-key': GLADIA_KEY },
    });
    const data = await r.json().catch(() => ({}));
    const status = data?.status;

    if (status === 'done') {
      const tr = data.result?.transcription ?? {};
      // Gladia has shipped sentences under both paths; accept either.
      const sentenceBlock = data.result?.sentences ?? tr.sentences;
      const sentences: GladiaChunk[] = Array.isArray(sentenceBlock?.results)
        ? sentenceBlock.results
        : Array.isArray(sentenceBlock)
          ? sentenceBlock
          : [];
      let segments = toSegments(sentences);
      if (segments.length === 0) {
        segments = toSegments(tr.utterances ?? []);
        console.log('[transcription-status] fell back to utterances', {
          conversationId,
          segments: segments.length,
        });
      }
      const language = Array.isArray(tr.languages)
        ? tr.languages.join(', ')
        : tr.languages ?? null;

      await admin
        .from('transcriptions')
        .update({ status: 'done', segments, language, error: null })
        .eq('user_id', user.id)
        .eq('conversation_id', conversationId);

      // The audio deliberately survives here. It used to be deleted the moment
      // the transcript landed, which meant a wrong transcript could never be run
      // again - and the first transcripts were wrong. It is now kept for
      // AUDIO_RETENTION_DAYS (see the `transcribe` function, which sweeps it).

      return json({ status: 'done', segments, language, audioPath: row.audio_path });
    }

    if (status === 'error') {
      await admin
        .from('transcriptions')
        .update({ status: 'error', error: 'Gladia kunne ikke transskribere lyden' })
        .eq('user_id', user.id)
        .eq('conversation_id', conversationId);
      return json({ status: 'error', segments: [], error: 'Gladia kunne ikke transskribere lyden' });
    }

    // queued / processing
    return json({ status: 'processing', segments: [] });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
