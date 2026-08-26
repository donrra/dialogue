/**
 * Wraps the native background recorder (@siteed/expo-audio-studio) and exposes
 * a small, app-shaped API. This is the heart of Fase 1: it keeps recording with
 * the screen off until the user explicitly stops.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';
import {
  useAudioRecorder,
  ExpoAudioStreamModule,
  type RecordingConfig,
  type AudioRecording,
} from '@siteed/expo-audio-studio';
import { colors } from '@/theme/theme';

export interface StopResult {
  audioUri?: string;
  durationMs: number;
  fileSizeBytes: number;
}

/** Outcome of an attempt to start recording — lets the UI show the right message. */
export type StartOutcome =
  | { ok: true }
  | { ok: false; reason: 'mic'; canAskAgain: boolean }
  | { ok: false; reason: 'error'; message: string };

export interface PermissionState {
  /** Microphone — mandatory for recording. */
  mic: boolean;
  /** Whether we can still prompt for the mic, or the user must use Settings. */
  micCanAskAgain: boolean;
  /** Notifications — used for the "recording" banner; recording works without it. */
  notifications: boolean;
}

interface RecordingValue {
  /** id of the conversation currently being recorded, or null. */
  activeConversationId: string | null;
  isRecording: boolean;
  isPaused: boolean;
  durationMs: number;
  sizeBytes: number;
  /** Request mic (required) + notifications (optional). Returns the resulting state. */
  ensurePermissions: () => Promise<PermissionState>;
  start: (conversationId: string) => Promise<StartOutcome>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<StopResult | null>;
}

const RecordingContext = createContext<RecordingValue | null>(null);

/**
 * Speech-optimized, small-footprint recording configuration.
 * `withNotification` is false when the user declined the notification permission;
 * recording still continues in the background via the keep-awake foreground service.
 */
function buildConfig(conversationId: string, withNotification: boolean): RecordingConfig {
  return {
    // 16 kHz mono is the sweet spot for speech transcription and keeps files small.
    sampleRate: 16000,
    channels: 1,
    encoding: 'pcm_16bit',

    // Keep the CPU awake so recording survives a locked / dark screen. This also
    // keeps the foreground service alive even when the notification is hidden.
    keepAwake: true,

    // Foreground-service notification — shown when the user allowed notifications.
    showNotification: withNotification,
    showWaveformInNotification: withNotification,
    notification: {
      title: 'Dialogue optager',
      text: 'Samtalen optages — åbn appen for at stoppe',
      android: {
        accentColor: colors.accent,
        channelName: 'Optagelse',
        channelDescription: 'Vises mens en samtale optages',
      },
    },

    // Survive phone calls and brief focus loss without ending the session.
    autoResumeAfterInterruption: true,
    android: { audioFocusStrategy: 'background' },

    // Only keep a compressed file: small enough to upload, fine to play back.
    output: {
      primary: { enabled: false },
      compressed: { enabled: true, format: 'aac', bitrate: 64000 },
    },

    // Long recordings + live waveform would grow JS memory; we don't need history.
    keepFullAnalysis: false,
    filename: conversationId,
  };
}

export function RecordingProvider({ children }: { children: React.ReactNode }) {
  const recorder = useAudioRecorder();
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null,
  );

  const ensurePermissions = useCallback(async (): Promise<PermissionState> => {
    if (Platform.OS === 'web') {
      return { mic: true, micCanAskAgain: true, notifications: true };
    }

    // 1) Microphone — required.
    let mic = false;
    let micCanAskAgain = true;
    try {
      let res = await ExpoAudioStreamModule.getPermissionsAsync();
      if (!res?.granted) {
        res = await ExpoAudioStreamModule.requestPermissionsAsync();
      }
      mic = !!res?.granted;
      micCanAskAgain = res?.canAskAgain !== false;
    } catch (err) {
      console.warn('[recording] mic permission error', err);
    }

    // 2) Notifications — optional, used for the foreground notification.
    let notifications = false;
    try {
      let res = await ExpoAudioStreamModule.getNotificationPermissionsAsync?.();
      if (!res?.granted) {
        res = await ExpoAudioStreamModule.requestNotificationPermissionsAsync?.();
      }
      notifications = !!res?.granted;
    } catch (err) {
      console.warn('[recording] notification permission error', err);
    }

    return { mic, micCanAskAgain, notifications };
  }, []);

  const start = useCallback(
    async (conversationId: string): Promise<StartOutcome> => {
      const perms = await ensurePermissions();
      if (!perms.mic) {
        return { ok: false, reason: 'mic', canAskAgain: perms.micCanAskAgain };
      }
      try {
        await recorder.startRecording(buildConfig(conversationId, perms.notifications));
        setActiveConversationId(conversationId);
        return { ok: true };
      } catch (err: any) {
        const message = String(err?.message ?? err);
        console.warn('[recording] failed to start', message);
        return { ok: false, reason: 'error', message };
      }
    },
    [ensurePermissions, recorder],
  );

  const pause = useCallback(async () => {
    try {
      await recorder.pauseRecording();
    } catch (err) {
      console.warn('[recording] pause failed', err);
    }
  }, [recorder]);

  const resume = useCallback(async () => {
    try {
      await recorder.resumeRecording();
    } catch (err) {
      console.warn('[recording] resume failed', err);
    }
  }, [recorder]);

  const stop = useCallback(async (): Promise<StopResult | null> => {
    try {
      const result: AudioRecording = await recorder.stopRecording();
      setActiveConversationId(null);
      const audioUri = result.compression?.compressedFileUri ?? result.fileUri;
      const fileSizeBytes = result.compression?.size ?? result.size ?? 0;
      return {
        audioUri,
        durationMs: result.durationMs ?? 0,
        fileSizeBytes,
      };
    } catch (err) {
      console.warn('[recording] stop failed', err);
      setActiveConversationId(null);
      return null;
    }
  }, [recorder]);

  const value = useMemo<RecordingValue>(
    () => ({
      activeConversationId,
      isRecording: recorder.isRecording,
      isPaused: recorder.isPaused,
      durationMs: recorder.durationMs,
      sizeBytes: recorder.size,
      ensurePermissions,
      start,
      pause,
      resume,
      stop,
    }),
    [
      activeConversationId,
      recorder.isRecording,
      recorder.isPaused,
      recorder.durationMs,
      recorder.size,
      ensurePermissions,
      start,
      pause,
      resume,
      stop,
    ],
  );

  return (
    <RecordingContext.Provider value={value}>
      {children}
    </RecordingContext.Provider>
  );
}

export function useRecording(): RecordingValue {
  const ctx = useContext(RecordingContext);
  if (!ctx) {
    throw new Error('useRecording must be used inside RecordingProvider');
  }
  return ctx;
}
