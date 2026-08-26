# Dialogue — project guide for AI agents

> Communication style & working defaults: see `~/.claude/CLAUDE.md`
> (Danish, plain language, consequence-before-implementation, founder/PO audience).

## What this is
A native Android-first app (Expo / React Native, SDK 54) that records
multi-party conversations, transcribes them with speaker separation, and runs
selectable AI analyses (one agent per analysis type).

## Pinned to SDK 54 — do NOT upgrade
The background-recording lib `@siteed/audio-studio` only compiles against Expo
SDK 54 (its Kotlin `Promise.reject` overrides break on SDK 56 → `compileReleaseKotlin`
fails on EAS). Stay on SDK 54 until the lib ships an SDK-56 build. Read the exact
versioned docs at https://docs.expo.dev/versions/v54.0.0/ before native/config edits.

## Build gotchas (hard-won)
- `.npmrc` has `legacy-peer-deps=true` — required so EAS Build's clean `npm install`
  doesn't fail ERESOLVE. Don't remove it.
- Don't add an explicit `android.permissions` array to app.json — let the config
  plugins inject permissions (incl. FOREGROUND_SERVICE_MICROPHONE).

## Architecture (Fase 1)
- **Navigation:** expo-router, file-based under `app/`.
- **Background recording:** `@siteed/expo-audio-studio` (re-exports
  `@siteed/audio-studio`). Config plugin must be referenced as
  `@siteed/audio-studio` in `app.json` (the wrapper has no `app.plugin.js`).
  It installs a `microphone` foreground service — this is what keeps recording
  alive with the screen off. Do not replace with bare `expo-audio` recording.
- **Recording config** lives in `src/context/RecordingContext.tsx`
  (`keepAwake`, `showNotification`, compressed AAC output, background audio focus).
- **State:** `ConversationsContext` (persisted to AsyncStorage) +
  `RecordingContext`. Storage API in `src/lib/storage.ts` is deliberately swap-
  able for Supabase in Fase 2 without touching screens.
- **Design system:** `src/theme/theme.ts` — never hard-code colors/spacing.

## Conventions
- Path alias `@/*` → `src/*` (tsconfig paths; no babel module-resolver needed).
- TypeScript strict. Run `npx tsc --noEmit` and `npx expo-doctor` before claiming done.
- Validate bundling with `npx expo export --platform android` (no device needed).
- Keep changes small and reversible; this app is the UX reference for "native done right".

## Build / run
Managed workflow (no committed `android/`/`ios/`). Installable APK via
`eas build --profile preview --platform android`. See README.md.

## Roadmap (not yet built)
Fase 2: transcription + speaker labeling (Supabase + multilingual diarization).
Fase 3: analysis agents on Claude (one system prompt per type, stored for easy
extension). Later: categorization, conversation continuation, "forretningsreferat"
workflows, cross-session voice enrollment.
