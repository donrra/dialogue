// Edge function: start a Gladia transcription for an uploaded recording.
// The Gladia API key stays server-side; the client only ever sends a storage path.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Languages the app may ask for. Everything here is confirmed supported by
 * Gladia. Danish is the default because that is what the app is built for.
 */
const ALLOWED_LANGUAGES = [
  'da', 'en', 'ur', 'ar', 'pa', 'hi', 'so', 'tr', 'pl', 'de', 'sv', 'no', 'fr', 'es', 'uk', 'ro',
];
const DEFAULT_LANGUAGE = 'da';

/**
 * How long a recording stays on the server after it is transcribed. It is kept
 * so a bad transcript can be run again with different settings; after that it
 * is deleted, because nobody needs a sensitive recording lying around.
 */
const AUDIO_RETENTION_DAYS = 7;

/**
 * Deletes recordings past their retention window. Runs whenever a transcription
 * is started, which is the natural moment: the user is recording anyway.
 */
// deno-lint-ignore no-explicit-any
async function sweepExpiredAudio(admin: any, uid: string) {
  const cutoff = new Date(
    Date.now() - AUDIO_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: stale } = await admin
    .from('transcriptions')
    .select('conversation_id,audio_path')
    .eq('user_id', uid)
    .not('audio_path', 'is', null)
    .lt('created_at', cutoff);
  if (!stale?.length) return;

  const paths = stale.map((r: { audio_path: string }) => r.audio_path);
  const { error } = await admin.storage.from('recordings').remove(paths);
  if (error) {
    console.warn('[transcribe] sweep failed', { error: error.message });
    return;
  }
  await admin
    .from('transcriptions')
    .update({ audio_path: null })
    .eq('user_id', uid)
    .in('conversation_id', stale.map((r: { conversation_id: string }) => r.conversation_id));
  console.log('[transcribe] swept expired audio', { count: paths.length });
}

/** Gladia rejects overly long vocabulary entries; keep the list short and clean. */
const MAX_VOCABULARY_TERMS = 30;

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

/**
 * Turns the names the user typed into a Gladia custom vocabulary. Phoneme
 * matching means a listed name is recognised instead of being guessed at
 * ("Ulla" rather than "Ulrik"/"Olla").
 */
function buildVocabulary(names: unknown): string[] {
  if (!Array.isArray(names)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    if (typeof raw !== 'string') continue;
    const value = raw.trim();
    // Single characters and very long strings are noise, not terms.
    if (value.length < 2 || value.length > 60) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= MAX_VOCABULARY_TERMS) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const {
      conversationId,
      path,
      languages,
      vocabulary,
      expectedSpeakers,
    } = await req.json();
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

    // The languages the user says were actually spoken, filtered to what Gladia
    // supports. Empty or nonsense falls back to Danish.
    const langs = (Array.isArray(languages) ? languages : [])
      .filter((l: unknown): l is string => typeof l === 'string')
      .filter((l, i, arr) => ALLOWED_LANGUAGES.includes(l) && arr.indexOf(l) === i);
    if (langs.length === 0) langs.push(DEFAULT_LANGUAGE);

    const terms = buildVocabulary(vocabulary);

    // LANGUAGE: only guess when there is something to guess about.
    // With `code_switching: true` Gladia picks a language per utterance. On a
    // Danish session with ['da','en'] that mislabelled a third of the speech as
    // English and then *invented* English words for Danish ("Ja" -> "Yeah", whole
    // sentences fabricated). So: one language means pin it and switch detection
    // off entirely. Several languages means the user has told us the session
    // really was mixed, and code switching is the only way to handle it - but
    // only across the short list they picked, never the full 100+.
    //
    // MODEL: solaria-1 is the only Gladia model that covers Danish. solaria-3 is
    // more accurate but supports en/fr/de/es/it only. Revisit when Danish lands.
    // deno-lint-ignore no-explicit-any
    const gladiaBody: Record<string, any> = {
      audio_url: signed.signedUrl,
      model: 'solaria-1',
      language_config: { languages: langs, code_switching: langs.length > 1 },
      diarization: true,
      // Semantic sentences instead of the short fragments utterances are split
      // into: whole sentences read better and give the analysis more context.
      sentences: true,
      // Marked [Alpha] by Gladia. First lever to pull if punctuation looks odd.
      punctuation_enhanced: true,
    };

    // The participant list the user filled in is ground truth about how many
    // voices are in the room; telling Gladia stops it inventing extra speakers.
    const speakerCount = Number(expectedSpeakers);
    if (Number.isInteger(speakerCount) && speakerCount >= 2 && speakerCount <= 10) {
      gladiaBody.diarization_config = { number_of_speakers: speakerCount };
    } else {
      gladiaBody.diarization_config = { min_speakers: 1, max_speakers: 6 };
    }

    if (terms.length > 0) {
      gladiaBody.custom_vocabulary = true;
      // 0.5 is Gladia's recommended middle ground: names get corrected without
      // dragging unrelated similar-sounding words along with them.
      gladiaBody.custom_vocabulary_config = {
        vocabulary: terms,
        default_intensity: 0.5,
      };
    }

    console.log('[transcribe] starting', {
      conversationId,
      languages: langs,
      speakers: gladiaBody.diarization_config,
      vocabularyTerms: terms.length,
    });

    // deno-lint-ignore no-explicit-any
    const startJob = async (body: Record<string, any>) => {
      const resp = await fetch('https://api.gladia.io/v2/pre-recorded', {
        method: 'POST',
        headers: { 'x-gladia-key': GLADIA_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { resp, data: await resp.json().catch(() => ({})) };
    };

    let { resp: gladiaResp, data: gladiaData } = await startJob(gladiaBody);

    // The accuracy extras above (sentences, enhanced punctuation, vocabulary)
    // are nice-to-haves; the pinned language is the actual fix. If Gladia
    // rejects the request for any of the extras, run again without them rather
    // than leaving the user with no transcript at all.
    // 400/422 are Gladia's "I don't accept this body" codes. Auth and rate-limit
    // errors are not worth a second call.
    if (gladiaResp.status === 400 || gladiaResp.status === 422) {
      console.warn('[transcribe] gladia rejected full config, retrying minimal', {
        conversationId,
        status: gladiaResp.status,
        detail: gladiaData,
      });
      ({ resp: gladiaResp, data: gladiaData } = await startJob({
        audio_url: signed.signedUrl,
        language_config: { languages: langs, code_switching: langs.length > 1 },
        diarization: true,
      }));
    }

    if (!gladiaResp.ok || !gladiaData.id) {
      console.warn('[transcribe] gladia init failed', {
        conversationId,
        status: gladiaResp.status,
        detail: gladiaData,
      });
      await setError(admin, user.id, conversationId, `Gladia-fejl (${gladiaResp.status})`);
      return json({ error: 'gladia init failed', detail: gladiaData }, 502);
    }

    // Clear the previous result so a re-run visibly starts over instead of
    // showing the old, wrong transcript while the new one is on its way.
    await admin
      .from('transcriptions')
      .update({
        gladia_id: gladiaData.id,
        status: 'processing',
        segments: [],
        language: null,
        error: null,
      })
      .eq('user_id', user.id)
      .eq('conversation_id', conversationId);

    // Housekeeping, after the user's job is safely queued.
    await sweepExpiredAudio(admin, user.id);

    return json({ ok: true, id: gladiaData.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
