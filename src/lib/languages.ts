/**
 * The languages a session can be transcribed in.
 *
 * Why this exists: the speech engine is far more accurate when it is told which
 * languages were actually spoken. Given one language it simply transcribes in
 * it. Given several it has to decide, sentence by sentence, which one it is
 * hearing - and every extra option on that list is another chance to guess
 * wrong. So the list stays short, and the user picks only what was really said.
 *
 * Every code here is confirmed supported by Gladia and mirrored in the
 * `transcribe` edge function's allow-list.
 */
export interface LanguageOption {
  code: string;
  label: string;
}

/** Danish first, then the languages most likely in a Danish practice. */
export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'da', label: 'Dansk' },
  { code: 'en', label: 'Engelsk' },
  { code: 'ur', label: 'Urdu' },
  { code: 'ar', label: 'Arabisk' },
  { code: 'pa', label: 'Punjabi' },
  { code: 'hi', label: 'Hindi' },
  { code: 'so', label: 'Somali' },
  { code: 'tr', label: 'Tyrkisk' },
  { code: 'pl', label: 'Polsk' },
  { code: 'uk', label: 'Ukrainsk' },
  { code: 'ro', label: 'Rumænsk' },
  { code: 'de', label: 'Tysk' },
  { code: 'sv', label: 'Svensk' },
  { code: 'no', label: 'Norsk' },
  { code: 'fr', label: 'Fransk' },
  { code: 'es', label: 'Spansk' },
];

export const DEFAULT_LANGUAGES = ['da'];

const LABELS: Record<string, string> = Object.fromEntries(
  LANGUAGE_OPTIONS.map((l) => [l.code, l.label]),
);

/** "Dansk", or "Dansk + Urdu" when a session really was mixed. */
export function languageSummary(codes: string[] | undefined): string {
  const list = codes?.length ? codes : DEFAULT_LANGUAGES;
  return list.map((c) => LABELS[c] ?? c).join(' + ');
}
