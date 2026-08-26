// Edge function: builds/updates a client's treatment overview
// ("behandlingsoverblik") from all of their per-session journal notes.
// The per-session notes stay untouched - this is the layer on top.
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

// The overview fields the app displays - kept in sync with the client screen.
const OVERVIEW_KEYS = [
  'forlob',
  'temaer',
  'udvikling',
  'opmaerksomhedspunkter',
  'naeste_skridt',
] as const;

const overviewSchema = {
  type: 'object',
  properties: Object.fromEntries(OVERVIEW_KEYS.map((k) => [k, { type: 'string' }])),
  required: [...OVERVIEW_KEYS],
  additionalProperties: false,
};

interface SessionRef {
  conversationId: string;
  date?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { clientId, clientName, sessions } = await req.json();
    if (!clientId || typeof clientId !== 'string') {
      return json({ error: 'missing clientId' }, 400);
    }
    if (!clientName || typeof clientName !== 'string') {
      return json({ error: 'missing clientName' }, 400);
    }
    if (!Array.isArray(sessions) || sessions.length === 0) {
      return json({ error: 'Ingen sessioner at bygge overblik af endnu.' }, 400);
    }

    const sessionRefs: SessionRef[] = sessions
      .filter((s: unknown): s is SessionRef =>
        !!s && typeof (s as SessionRef).conversationId === 'string')
      .slice(0, 100);
    const conversationIds = sessionRefs.map((s) => s.conversationId);

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

    // Fetch the journal notes for this client's sessions (owner-scoped).
    const { data: rows, error: dbErr } = await admin
      .from('analyses')
      .select('conversation_id,output,created_at')
      .eq('user_id', user.id)
      .eq('type', 'psykolog')
      .in('conversation_id', conversationIds);

    if (dbErr) {
      console.error('[analyze-overblik] notes lookup failed', {
        clientId,
        dbError: dbErr.message,
      });
      return json({ error: 'Kunne ikke hente journalnotaterne.', detail: dbErr.message }, 500);
    }

    const byConversation = new Map((rows ?? []).map((r) => [r.conversation_id, r]));
    // Keep the app's order (chronological) and skip sessions without a note yet.
    const notes = sessionRefs
      .map((s) => {
        const row = byConversation.get(s.conversationId);
        if (!row) return null;
        return { date: s.date ?? null, note: row.output };
      })
      .filter(Boolean);

    if (notes.length === 0) {
      return json({
        error: 'Ingen journalnotater fundet - kør analysen på mindst én session først.',
      }, 400);
    }

    console.log('[analyze-overblik] start', {
      clientId,
      requestedSessions: sessionRefs.length,
      notesFound: notes.length,
    });

    const systemPrompt = `Du er en erfaren psykolog der vedligeholder et samlet behandlingsoverblik for en klient.

Du får klientens journalnotater fra alle sessioner i kronologisk rækkefølge (JSON). Skriv ét samlet overblik over behandlingsforløbet med disse felter:

1. **forlob** - kort resumé af forløbet indtil nu: antal sessioner, hvad der er arbejdet med
2. **temaer** - gennemgående temaer på tværs af sessionerne
3. **udvikling** - hvordan har klienten udviklet sig fra første til seneste session?
4. **opmaerksomhedspunkter** - uafklarede punkter og risici der kræver opmærksomhed (fx uafklarede udsagn, manglende risikovurdering). Skriv "Ingen aktuelle" hvis der ikke er nogen.
5. **naeste_skridt** - anbefalinger og plan fremadrettet

Krav:
- Kortfattet og klinisk brugbart - overblikket skal kunne læses på ét minut
- Byg KUN på det der står i notaterne; opfind intet
- Ved modstrid mellem notater vægter det nyeste højest
- Overblikket erstatter IKKE session-notaterne - det er laget ovenpå`;

    const requestBody = {
      model: 'claude-opus-5',
      max_tokens: 16000,
      system: systemPrompt,
      output_config: {
        format: { type: 'json_schema', schema: overviewSchema },
      },
      messages: [
        {
          role: 'user',
          content:
            `Klient: ${clientName}\nAntal sessioner med journalnotat: ${notes.length}\n\n` +
            `Journalnotater i kronologisk rækkefølge:\n${JSON.stringify(notes, null, 1)}`,
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
      console.error('[analyze-overblik] anthropic api failed', {
        clientId,
        status: anthropicResp.status,
        errorText: errText,
      });
      return json({
        error: `Overblikket kunne ikke laves (serverfejl ${anthropicResp.status}). Prøv igen om lidt.`,
        detail: errText.slice(0, 500),
      }, 502);
    }

    const anthropicData = await anthropicResp.json();
    const stopReason = anthropicData.stop_reason;
    console.log('[analyze-overblik] anthropic response', {
      clientId,
      stopReason,
      usage: anthropicData.usage ?? null,
    });

    if (stopReason === 'refusal') {
      console.error('[analyze-overblik] model refused', {
        clientId,
        stopDetails: anthropicData.stop_details ?? null,
      });
      return json({ error: 'AI-modellen afviste at lave overblikket.' }, 502);
    }
    if (stopReason === 'max_tokens') {
      console.error('[analyze-overblik] truncated at max_tokens', { clientId });
      return json({ error: 'Overblikket blev for langt og blev afbrudt. Prøv igen.' }, 502);
    }

    // deno-lint-ignore no-explicit-any
    const text = anthropicData.content?.find((c: any) => c.type === 'text')?.text ?? '';
    if (!text) {
      console.error('[analyze-overblik] no text content', { clientId, stopReason });
      return json({ error: 'AI-analysen gav intet svar. Prøv igen.' }, 502);
    }

    let overview: Record<string, string>;
    try {
      overview = JSON.parse(text);
    } catch (e) {
      console.error('[analyze-overblik] JSON parse failed', {
        clientId,
        parseError: String(e),
        textPreview: text.slice(0, 300),
      });
      return json({ error: 'AI-svaret kunne ikke læses. Prøv igen.' }, 502);
    }

    const { error: saveErr } = await admin.from('client_overviews').upsert(
      {
        user_id: user.id,
        client_id: clientId,
        client_name: clientName,
        output: overview,
        session_count: notes.length,
        error: null,
      },
      { onConflict: 'user_id,client_id' },
    );

    if (saveErr) {
      console.error('[analyze-overblik] save failed', { clientId, dbError: saveErr.message });
      return json({ error: 'Overblikket kunne ikke gemmes.', detail: saveErr.message }, 500);
    }

    console.log('[analyze-overblik] done', { clientId, sessionCount: notes.length });
    return json({ ok: true, overview, sessionCount: notes.length });
  } catch (e) {
    console.error('[analyze-overblik] unhandled error', { error: String(e) });
    return json({ error: String(e) }, 500);
  }
});
