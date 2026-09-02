/**
 * Getting the journal note out of the app.
 *
 * Two ways out, because they solve different problems:
 *  - PDF: an A4 document laid out after the STPS journal requirements, meant to
 *    be printed, archived or attached to a client's file.
 *  - JSON: the same note as raw structured data, plus the session metadata and
 *    the transcript it was built from. This is the escape hatch - the day a
 *    journal system is chosen, everything can be moved without retyping.
 *
 * Both are handed to the system share sheet rather than written somewhere the
 * user has to go looking for.
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import type { AnalysisResult } from './analysis';
import type { TranscriptSegment } from './transcription';
import type { Client, Conversation } from './types';

/**
 * The eight fields STPS requires in a journal note, in the order they should be
 * read. Mirrors JOURNAL_KEYS in supabase/functions/analyze-psykolog - keep the
 * two in step if the schema changes.
 */
export const JOURNAL_FIELDS = [
  { key: 'datum', label: 'Dato' },
  { key: 'deltagere', label: 'Deltagere' },
  { key: 'planlagt_behandling', label: 'Planlagt behandling' },
  { key: 'udfort_behandling', label: 'Udført behandling' },
  { key: 'tilstand', label: 'Tilstand' },
  { key: 'respons', label: 'Respons på behandling' },
  { key: 'observationer', label: 'Observationer' },
  { key: 'opfolging', label: 'Opfølgning' },
] as const;

export interface JournalExportInput {
  conversation: Conversation;
  client?: Client;
  analysis: AnalysisResult;
  /** Only used by the JSON export; the PDF is the note alone. */
  segments?: TranscriptSegment[];
}

/** A value from the model is normally a string, but never trust that blindly. */
function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.join(', ');
  if (value == null) return '';
  return String(value);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Blank lines in a field become paragraphs, single newlines become breaks. */
function toParagraphs(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '<p class="empty">Ikke udfyldt</p>';
  return trimmed
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br />')}</p>`)
    .join('');
}

function danishDate(ms: number): string {
  return new Date(ms).toLocaleDateString('da-DK', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function isoDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Strip anything Android or a desktop OS would refuse in a filename. */
function safeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function participantNames(conversation: Conversation): string[] {
  const fromSpeakers = Object.values(conversation.speakerNames ?? {}).filter(Boolean);
  if (fromSpeakers.length) return fromSpeakers;
  return conversation.participants.map((p) => p.name).filter(Boolean);
}

/**
 * The printable note. A4 with no page margins from the renderer (expo-print
 * asks Android for NO_MARGINS), so all whitespace is controlled here.
 */
export function buildJournalHtml(input: JournalExportInput): string {
  const { conversation, client, analysis } = input;
  const output = analysis.output as Record<string, unknown>;

  const clientName = client?.name ?? 'Ikke tilknyttet en klient';
  const sessionDate = danishDate(conversation.createdAt);
  const people = participantNames(conversation);

  const fields = JOURNAL_FIELDS.map(
    ({ key, label }) => `
      <section class="field">
        <h2>${escapeHtml(label)}</h2>
        ${toParagraphs(asText(output[key]))}
      </section>`,
  ).join('');

  // If the model ever falls back to unstructured text, show it rather than
  // silently printing an empty note.
  const raw = asText(output.raw).trim();
  const rawBlock = raw
    ? `<section class="field"><h2>Resultat</h2>${toParagraphs(raw)}</section>`
    : '';

  return `<!DOCTYPE html>
<html lang="da">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 18mm 16mm 16mm;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.5;
    color: #111111;
  }
  header { border-bottom: 1.2pt solid #111111; padding-bottom: 5mm; margin-bottom: 7mm; }
  h1 {
    margin: 0 0 4mm;
    font-size: 17pt;
    font-weight: 600;
    letter-spacing: 0.2pt;
  }
  .ident { display: table; width: 100%; border-collapse: collapse; }
  .ident-row { display: table-row; }
  .ident-row > * { display: table-cell; padding: 0.8mm 0; vertical-align: top; }
  .ident-label {
    width: 32mm;
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.4pt;
    color: #555555;
    padding-right: 4mm;
  }
  .ident-value { font-weight: 500; }
  .field { margin-bottom: 6.5mm; }
  h2 {
    margin: 0 0 1.5mm;
    font-size: 9pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5pt;
    color: #333333;
    break-after: avoid;
    page-break-after: avoid;
  }
  p { margin: 0 0 2mm; }
  p:last-child { margin-bottom: 0; }
  .empty { color: #888888; font-style: italic; }
  footer {
    margin-top: 10mm;
    padding-top: 5mm;
    border-top: 0.5pt solid #bbbbbb;
    font-size: 8.5pt;
    color: #555555;
  }
  .sign { margin-top: 8mm; }
  .sign-line {
    border-bottom: 0.5pt solid #111111;
    height: 9mm;
    width: 78mm;
  }
  .sign-caption { font-size: 8.5pt; color: #555555; padding-top: 1.5mm; }
  .origin { margin-top: 5mm; }
</style>
</head>
<body>
  <header>
    <h1>Journalnotat</h1>
    <div class="ident">
      <div class="ident-row">
        <div class="ident-label">Klient</div>
        <div class="ident-value">${escapeHtml(clientName)}</div>
      </div>
      <div class="ident-row">
        <div class="ident-label">Sessionsdato</div>
        <div class="ident-value">${escapeHtml(sessionDate)}</div>
      </div>
      <div class="ident-row">
        <div class="ident-label">Til stede</div>
        <div class="ident-value">${escapeHtml(people.length ? people.join(', ') : 'Ikke angivet')}</div>
      </div>
      <div class="ident-row">
        <div class="ident-label">Session</div>
        <div class="ident-value">${escapeHtml(conversation.title)}</div>
      </div>
    </div>
  </header>

  ${fields}
  ${rawBlock}

  <footer>
    <div class="sign">
      <div class="sign-line"></div>
      <div class="sign-caption">Noteret af (navn og dato)</div>
    </div>
    <div class="origin">
      Notatet er udarbejdet på grundlag af en lydoptagelse af sessionen og skal
      gennemlæses og godkendes af den ansvarlige behandler.
      Udskrevet ${escapeHtml(danishDate(Date.now()))}.
    </div>
  </footer>
</body>
</html>`;
}

/** Writes a file into the cache under a readable name and opens the share sheet. */
async function shareFile(uri: string, filename: string, mimeType: string, uti: string) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Deling er ikke tilgængelig på denne enhed.');
  }
  await Sharing.shareAsync(uri, { mimeType, UTI: uti, dialogTitle: filename });
}

function cacheFile(filename: string): File {
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  return file;
}

/** A4 PDF of the journal note, handed to the share sheet. */
export async function exportJournalPdf(input: JournalExportInput): Promise<void> {
  const html = buildJournalHtml(input);

  // A4 in PostScript points - expo-print's default is US Letter.
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });

  const name = safeFilename(
    `Journalnotat - ${input.client?.name ?? 'uden klient'} - ${isoDate(input.conversation.createdAt)}`,
  );
  const destination = cacheFile(`${name}.pdf`);
  new File(uri).move(destination);

  await shareFile(destination.uri, destination.name, 'application/pdf', 'com.adobe.pdf');
}

/**
 * Everything about the session as structured data. Keys are stable English
 * identifiers so another system can map them; the human-readable Danish labels
 * travel alongside, so the file is still readable on its own.
 */
export function buildJournalJson(input: JournalExportInput): Record<string, unknown> {
  const { conversation, client, analysis, segments } = input;
  const output = analysis.output as Record<string, unknown>;
  const names = conversation.speakerNames ?? {};

  return {
    format: 'dialogue.journal.v1',
    exported_at: new Date().toISOString(),
    client: client ? { id: client.id, name: client.name } : null,
    session: {
      id: conversation.id,
      title: conversation.title,
      recorded_at: new Date(conversation.createdAt).toISOString(),
      duration_ms: conversation.durationMs ?? null,
      languages: conversation.languages ?? null,
      participants: participantNames(conversation),
      speaker_names: names,
    },
    journal_note: {
      type: analysis.type,
      created_at: analysis.createdAt,
      fields: JOURNAL_FIELDS.map(({ key, label }) => ({
        key,
        label,
        text: asText(output[key]),
      })),
      ...(asText(output.raw).trim() ? { raw: asText(output.raw) } : {}),
    },
    transcript: segments?.length
      ? {
          segment_count: segments.length,
          segments: segments.map((s) => ({
            speaker: s.speaker,
            speaker_name: names[s.speaker] ?? null,
            text: s.text,
            start_seconds: s.start,
            end_seconds: s.end,
            language: s.language ?? null,
            edited_by_human: Boolean(s.edited),
          })),
        }
      : null,
  };
}

/** The session as a JSON file, handed to the share sheet. */
export async function exportJournalJson(input: JournalExportInput): Promise<void> {
  const payload = buildJournalJson(input);

  const name = safeFilename(
    `Journalnotat - ${input.client?.name ?? 'uden klient'} - ${isoDate(input.conversation.createdAt)}`,
  );
  const file = cacheFile(`${name}.json`);
  file.create();
  file.write(JSON.stringify(payload, null, 2));

  await shareFile(file.uri, file.name, 'application/json', 'public.json');
}
