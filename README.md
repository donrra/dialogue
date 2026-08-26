# Dialogue 🎙️

En app der optager samtaler mellem flere deltagere, laver dem om til tekst med
hvem-siger-hvad, og analyserer dem med forskellige AI-agenter.

> Kommunikationsstil og arbejdsform: se `~/.claude/CLAUDE.md`.

---

## Status: Fase 1 færdig — Optagelse

Det her er bygget og virker:

- **Opret samtale** med titel og deltagere (`app/new.tsx`)
- **Optagelse i baggrunden** — fortsætter med slukket/låst skærm og selv hvis du
  forlader appen. Stopper først når du selv afslutter samtalen.
- **"Sluk skærm"-knap** — gør skærmen sort og dæmper lysstyrken for at spare
  batteri, mens optagelsen kører videre (`src/components/ScreenOffOverlay.tsx`)
- **Tilføj deltagere undervejs** i en igangværende optagelse
- **Oversigt + afspilning** af tidligere samtaler

Næste faser (ikke bygget endnu):

- **Fase 2** — Tekst + hvem taler (transskribering med flere sprog)
- **Fase 3** — Analyse-agenter (psykolog, forretningsreferat, interview …)
- **Fase 4** — Finpudsning af UX

---

## Sådan får du appen på din Android-telefon (uden Google Play)

Du behøver **ikke** udvikler-værktøj på din PC. Vi bygger app-filen i skyen.

### Engangs-opsætning
1. Opret en gratis konto på [expo.dev](https://expo.dev).
2. I en terminal i denne mappe:
   ```bash
   npm install -g eas-cli
   eas login
   ```

### Byg en installérbar app-fil (APK)
```bash
eas build --profile preview --platform android
```
- Vælg "ja" hvis den spørger om at oprette projekt / generere en keystore.
- Efter et par minutter får du et link. Åbn det på telefonen og installer
  filen (tillad "installer fra ukendt kilde" hvis Android spørger).

Det er en helt selvstændig app — den kører uden at din computer er tændt.
Hver gang vi laver ændringer, kører du `eas build` igen for en ny version.

### Når du udvikler/tester hurtigt
For løbende test uden at bygge en ny APK hver gang, lav én gang et
*development build* (`eas build --profile development --platform android`),
installer det, og kør derefter `npm start` på PC'en — så henter appen ændringer
live, så længe telefon og PC er på samme netværk.

---

## Teknisk kort

| Lag | Valg |
|---|---|
| App | Expo (React Native), SDK 54, expo-router |
| Optagelse | `@siteed/expo-audio-studio` — baggrund + foreground service (mikrofon) |
| Lyd | 16 kHz mono AAC (lille fil, god til tale + upload) |
| Lagring (Fase 1) | Lokalt på telefonen (AsyncStorage) |
| Senere | Supabase (server) + transskribering + Claude-analyser |

Mappestruktur:
```
app/                # skærme (expo-router)
  index.tsx         # forside / oversigt
  new.tsx           # ny samtale + deltagere
  record/[id].tsx   # optage-skærm (kernen)
  conversation/[id].tsx  # detalje + afspilning
src/
  components/       # UI-byggeklodser
  context/          # optage- og samtale-tilstand
  lib/              # typer, lagring, formattering
  theme/            # designsystem (farver, afstande, typografi)
```
