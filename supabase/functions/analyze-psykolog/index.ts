// Edge function: AI-psykologen analyzes a transcribed conversation and produces
// a journal entry following STPS (Sundhedsstyrelsen) requirements.
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

interface TranscriptSegment {
  speaker: string;
  text: string;
  start: number;
  end: number;
  language?: string;
}

// The journal fields the app displays - kept in sync with AnalysisSection.tsx.
const JOURNAL_KEYS = [
  'datum',
  'deltagere',
  'planlagt_behandling',
  'udfort_behandling',
  'tilstand',
  'respons',
  'observationer',
  'opfolging',
] as const;

// Structured output schema: forces Claude to return exactly these keys as
// strings, so the client never has to guess at the response shape.
const journalSchema = {
  type: 'object',
  properties: Object.fromEntries(JOURNAL_KEYS.map((k) => [k, { type: 'string' }])),
  required: [...JOURNAL_KEYS],
  additionalProperties: false,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { conversationId, speakerNames } = await req.json();
    if (!conversationId) return json({ error: 'missing conversationId' }, 400);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_KEY) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);

    // Identify caller
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Fetch transcription
    const { data: tr, error: trErr } = await admin
      .from('transcriptions')
      .select('segments,language,status')
      .eq('user_id', user.id)
      .eq('conversation_id', conversationId)
      .maybeSingle();

    if (trErr || !tr) {
      console.error('[analyze-psykolog] transcription lookup failed', {
        conversationId,
        dbError: trErr?.message ?? null,
        found: !!tr,
      });
      return json({ error: 'Transskriptionen blev ikke fundet. Kør transskribering først.' }, 400);
    }
    if (tr.status !== 'done') {
      console.warn('[analyze-psykolog] transcription not ready', {
        conversationId,
        status: tr.status,
      });
      return json({ error: `Transskriptionen er ikke færdig endnu (status: ${tr.status}).` }, 400);
    }

    let segments: TranscriptSegment[] = [];
    if (Array.isArray(tr.segments)) {
      segments = tr.segments;
    } else if (typeof tr.segments === 'string') {
      try {
        segments = JSON.parse(tr.segments);
      } catch {
        segments = [];
      }
    }

    // Speaker-label mapping ("Taler 1" -> "Ulla") lives on the device, so the
    // app sends it along. Fall back to the raw labels if nothing is mapped.
    const names: Record<string, string> = {};
    if (speakerNames && typeof speakerNames === 'object' && !Array.isArray(speakerNames)) {
      for (const [label, name] of Object.entries(speakerNames)) {
        if (typeof name === 'string' && name.trim()) names[label] = name.trim();
      }
    }

    const transcript = segments
      .map((seg) => `${names[seg.speaker] ?? seg.speaker}: ${seg.text}`)
      .join('\n\n');

    if (!transcript.trim()) {
      console.warn('[analyze-psykolog] empty transcript', {
        conversationId,
        segmentCount: segments.length,
      });
      return json({ error: 'Transskriptionen er tom - der er ingen tekst at analysere.' }, 400);
    }

    console.log('[analyze-psykolog] start', {
      conversationId,
      segmentCount: segments.length,
      transcriptChars: transcript.length,
      mappedSpeakers: Object.keys(names),
    });

    const systemPrompt = `Du er en erfaren psykolog der hjælper med at strukturere kliniknoter.

Din opgave er at analysere samtaler og producere velformaterede journalindlæg, der overholder Sundhedsstyrelsens (STPS) vejledning for psykologers journalføring.

Hver journal skal indeholde:
1. **datum** - dato for sessionen (hvis den nævnes i samtalen)
2. **deltagere** - psykolog + patient/klient
3. **planlagt_behandling** - hvad var intentionen for denne session?
4. **udfort_behandling** - hvad blev faktisk gjort?
5. **tilstand** - hvordan var patienten fysisk/psykisk?
6. **respons** - hvordan reagerede patienten på behandlingen?
7. **observationer** - vigtige fund eller tegn
8. **opfolging** - næste skridt, handlepunkter, anbefalinger

Formatet skal være:
- Klart og struktureret (så kolleger hurtigt kan søge information)
- Fagligt, men tilgængeligt
- Kortfattet, kun relevante detaljer
- Fri for vurderinger uden grund

Hvis et element ikke kan identificeres fra samtalen, skriv "[Ikke dokumenteret]" i det felt.`;

    const requestBody = {
      model: 'claude-opus-5',
      // Rummelig grænse: modellens interne ræsonnering tæller også med her,
      // så 4000 var for lavt og kunne afbryde svaret midtvejs.
      max_tokens: 16000,
      system: systemPrompt,
      output_config: {
        format: { type: 'json_schema', schema: journalSchema },
      },
      messages: [
        {
          role: 'user',
          content: `Analyser denne transskriberede samtale og producer et STPS-kompatibelt journalnotat:\n\n${transcript}`,
        },
      ],
    };

    const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text();
      console.error('[analyze-psykolog] anthropic api failed', {
        conversationId,
        status: anthropicResp.status,
        errorText: errText,
        model: requestBody.model,
        transcriptChars: transcript.length,
      });
      return json({
        error: `AI-analysen fejlede (serverfejl ${anthropicResp.status}). Prøv igen om lidt.`,
        detail: errText.slice(0, 500),
      }, 502);
    }

    const anthropicData = await anthropicResp.json();
    const stopReason = anthropicData.stop_reason;
    console.log('[analyze-psykolog] anthropic response', {
      conversationId,
      stopReason,
      usage: anthropicData.usage ?? null,
    });

    if (stopReason === 'refusal') {
      console.error('[analyze-psykolog] model refused', {
        conversationId,
        stopDetails: anthropicData.stop_details ?? null,
      });
      return json({ error: 'AI-modellen afviste at analysere denne samtale.' }, 502);
    }
    if (stopReason === 'max_tokens') {
      console.error('[analyze-psykolog] response truncated at max_tokens', { conversationId });
      return json({ error: 'Analysen blev for lang og blev afbrudt. Prøv igen.' }, 502);
    }

    // deno-lint-ignore no-explicit-any
    const analysisText = anthropicData.content?.find((c: any) => c.type === 'text')?.text ?? '';
    if (!analysisText) {
      console.error('[analyze-psykolog] no text content in response', {
        conversationId,
        stopReason,
        contentTypes: (anthropicData.content ?? []).map((c: { type: string }) => c.type),
      });
      return json({ error: 'AI-analysen gav intet svar. Prøv igen.' }, 502);
    }

    // Structured outputs guarantee valid JSON matching journalSchema.
    let analysis: Record<string, string>;
    try {
      analysis = JSON.parse(analysisText);
    } catch (e) {
      console.error('[analyze-psykolog] JSON parse failed despite structured output', {
        conversationId,
        parseError: String(e),
        textPreview: analysisText.slice(0, 300),
      });
      return json({ error: 'AI-svaret kunne ikke læses. Prøv igen.' }, 502);
    }

    // Store result as "psykolog" analysis
    const { error: saveErr } = await admin.from('analyses').upsert(
      {
        user_id: user.id,
        conversation_id: conversationId,
        type: 'psykolog',
        output: analysis,
        error: null,
      },
      { onConflict: 'user_id,conversation_id,type' },
    );

    if (saveErr) {
      console.error('[analyze-psykolog] save failed', {
        conversationId,
        dbError: saveErr.message,
      });
      return json({ error: 'Analysen kunne ikke gemmes.', detail: saveErr.message }, 500);
    }

    console.log('[analyze-psykolog] done', {
      conversationId,
      fields: Object.keys(analysis),
    });
    return json({ ok: true, analysis });
  } catch (e) {
    console.error('[analyze-psykolog] unhandled error', { error: String(e) });
    return json({ error: String(e) }, 500);
  }
});
