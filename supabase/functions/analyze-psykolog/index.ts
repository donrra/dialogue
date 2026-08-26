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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { conversationId } = await req.json();
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

    // Fetch transcription + conversation (for participant names)
    const [tr, conv] = await Promise.all([
      admin
        .from('transcriptions')
        .select('segments,language')
        .eq('user_id', user.id)
        .eq('conversation_id', conversationId)
        .maybeSingle(),
      admin
        .from('conversations')
        .select('title,participants,speakerNames')
        .eq('id', conversationId)
        .maybeSingle(),
    ]);

    if (tr.error || !tr.data || tr.data.status !== 'done') {
      return json({ error: 'transskription ikke klar' }, 400);
    }

    const segments: TranscriptSegment[] = tr.data.segments ?? [];
    const speakerNames = conv.data?.speakerNames ?? {};

    // Build transcript with real speaker names
    const transcript = segments
      .map((seg) => {
        const name = speakerNames[seg.speaker] ?? seg.speaker;
        return `${name}: ${seg.text}`;
      })
      .join('\n\n');

    // System prompt aligned with STPS journal requirements
    const systemPrompt = `Du er en erfaren psykolog og journalisialist der hjælper med at strukturere kliniknoter.

Din opgave er at analysere samtaler og producere velformaterede journalindlæg, der overholder Sundhedsstyrelsens (STPS) vejledning for psykologers journalføring.

Hver journal skal indeholde:
1. **Dato** (dato for sessionen)
2. **Deltagere** (psykolog + patient/klient)
3. **Planlagt behandling** - hvad var intentionen for denne session?
4. **Udført behandling** - hvad blev faktisk gjort?
5. **Patientens tilstand** - hvordan var de fysisk/psykisk?
6. **Respons på behandling** - hvordan reagerede de?
7. **Observationer** - vigtige fund eller tegn
8. **Opfølgning** - næste skridt, handlepunkter, anbefalinger

Formatet skal være:
- Klart og struktureret (så kolleger hurtigt kan søge information)
- Fagligt, men tilgængeligt
- Kortfattet, kun relevante detaljer
- Fri for vurderinger uden grund

Hvis nogle elementer ikke kan identificeres fra samtalen, markér dem som "[Ikke dokumenteret]".

Output som JSON med nøglerne: datum, deltagere, planlagt_behandling, udfort_behandling, tilstand, respons, observationer, opfolging.`;

    // Call Claude
    const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-5',
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: `Analyser denne transskriberet samtale og producer en STPS-kompatibel journalnotat:\n\n${transcript}`,
          },
        ],
        system: systemPrompt,
      }),
    });

    if (!anthropicResp.ok) {
      const err = await anthropicResp.json().catch(() => ({}));
      return json({ error: 'anthropic failed', detail: err }, 502);
    }

    const anthropicData = await anthropicResp.json();
    const analysisText = anthropicData.content?.[0]?.text ?? '';

    // Try to parse JSON from Claude's response
    let analysis = {};
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        analysis = JSON.parse(jsonMatch[0]);
      } catch {
        analysis = { raw: analysisText };
      }
    } else {
      analysis = { raw: analysisText };
    }

    // Store result as "psykolog" analysis
    const { error: saveErr } = await admin.from('analyses').upsert(
      {
        user_id: user.id,
        conversation_id: conversationId,
        type: 'psykolog',
        output: analysis,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,conversation_id,type' },
    );

    if (saveErr) {
      return json({ error: 'could not save analysis', detail: saveErr.message }, 500);
    }

    return json({ ok: true, analysis });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
