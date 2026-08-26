/**
 * Supabase client + anonymous session bootstrap.
 *
 * The app signs in anonymously so every device gets a stable identity that
 * Row-Level Security can key on — recordings and transcripts stay private to
 * the device, with no username/password. Real accounts can be layered on later.
 */
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

export const SUPABASE_URL = extra.supabaseUrl ?? '';
const SUPABASE_ANON_KEY = extra.supabaseAnonKey ?? '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

let sessionPromise: Promise<string | null> | null = null;

/**
 * Returns the current user id, signing in anonymously the first time.
 * Cached so concurrent callers share one sign-in. On failure we clear the cache
 * so a later call can retry (e.g. after the device regains connectivity).
 */
export function ensureSession(): Promise<string | null> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) return data.session.user.id;
        const { data: anon, error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
        return anon.user?.id ?? null;
      } catch (err) {
        console.warn('[supabase] anonymous sign-in failed', err);
        sessionPromise = null;
        return null;
      }
    })();
  }
  return sessionPromise;
}
