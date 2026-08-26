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

interface GladiaUtterance {
  speaker?: number;
  text?: string;
  start?: number;
  end?: number;
  language?: string;
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
    // Already settled — return the stored result.
    if (row.status === 'done' || row.status === 'error') {
      return json({
        status: row.status,
        segments: row.segments ?? [],
        language: row.language,
        error: row.error,
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
      const utterances: GladiaUtterance[] = tr.utterances ?? [];
      const segments = utterances
        .map((u) => ({
          speaker:
            typeof u.speaker === 'number' && u.speaker >= 0
              ? `Taler ${u.speaker + 1}`
              : 'Ukendt',
          text: (u.text ?? '').trim(),
          start: u.start ?? 0,
          end: u.end ?? 0,
          language: u.language,
        }))
        .filter((s) => s.text.length > 0);
      const language = Array.isArray(tr.languages)
        ? tr.languages.join(', ')
        : tr.languages ?? null;

      await admin
        .from('transcriptions')
        .update({ status: 'done', segments, language, error: null })
        .eq('user_id', user.id)
        .eq('conversation_id', conversationId);

      // The transcript is stored - delete the audio so no large, sensitive
      // recordings linger in storage.
      if (row.audio_path) {
        const { error: rmErr } = await admin.storage
          .from('recordings')
          .remove([row.audio_path]);
        if (rmErr) {
          console.warn('[transcription-status] audio delete failed', {
            conversationId,
            path: row.audio_path,
            error: rmErr.message,
          });
        } else {
          await admin
            .from('transcriptions')
            .update({ audio_path: null })
            .eq('user_id', user.id)
            .eq('conversation_id', conversationId);
          console.log('[transcription-status] audio deleted after transcription', {
            conversationId,
          });
        }
      }

      return json({ status: 'done', segments, language });
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
