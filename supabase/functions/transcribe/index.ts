// Edge function: start a Gladia transcription for an uploaded recording.
// The Gladia API key stays server-side; the client only ever sends a storage path.
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

// deno-lint-ignore no-explicit-any
async function setError(admin: any, uid: string, cid: string, msg: string) {
  await admin
    .from('transcriptions')
    .update({ status: 'error', error: msg })
    .eq('user_id', uid)
    .eq('conversation_id', cid);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { conversationId, path } = await req.json();
    if (!conversationId || !path) return json({ error: 'missing params' }, 400);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const GLADIA_KEY = Deno.env.get('GLADIA_API_KEY');
    if (!GLADIA_KEY) return json({ error: 'GLADIA_API_KEY not configured' }, 500);

    // Identify the caller from their JWT.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // A time-limited URL so Gladia can fetch the private audio file.
    const { data: signed, error: signErr } = await admin.storage
      .from('recordings')
      .createSignedUrl(path, 60 * 60 * 6);
    if (signErr || !signed) {
      await setError(admin, user.id, conversationId, 'Kunne ikke læse lydfilen');
      return json({ error: signErr?.message ?? 'sign failed' }, 500);
    }

    // Kick off transcription with speaker diarization + per-utterance language
    // detection (handles conversations that switch language mid-way).
    const gladiaResp = await fetch('https://api.gladia.io/v2/pre-recorded', {
      method: 'POST',
      headers: { 'x-gladia-key': GLADIA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio_url: signed.signedUrl,
        diarization: true,
        // Constrain detection to the languages actually spoken so Danish isn't
        // mistaken for German. code_switching still allows mixing da/en.
        language_config: { languages: ['da', 'en'], code_switching: true },
      }),
    });
    const gladiaData = await gladiaResp.json().catch(() => ({}));
    if (!gladiaResp.ok || !gladiaData.id) {
      await setError(admin, user.id, conversationId, `Gladia-fejl (${gladiaResp.status})`);
      return json({ error: 'gladia init failed', detail: gladiaData }, 502);
    }

    await admin
      .from('transcriptions')
      .update({ gladia_id: gladiaData.id, status: 'processing', error: null })
      .eq('user_id', user.id)
      .eq('conversation_id', conversationId);

    return json({ ok: true, id: gladiaData.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
