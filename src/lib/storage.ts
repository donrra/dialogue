/**
 * Local persistence for conversations (Fase 1).
 * Backed by AsyncStorage. In Fase 2/3 this becomes a sync layer on top of Supabase,
 * but the public API here stays the same so screens don't need to change.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Client, Conversation } from './types';

const KEY = 'dialogue.conversations.v1';
const CLIENTS_KEY = 'dialogue.clients.v1';

export async function loadConversations(): Promise<Conversation[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Conversation[];
    // Newest first.
    return parsed.sort((a, b) => b.createdAt - a.createdAt);
  } catch (err) {
    console.warn('[storage] failed to load conversations', err);
    return [];
  }
}

export async function saveConversations(items: Conversation[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(items));
  } catch (err) {
    console.warn('[storage] failed to save conversations', err);
  }
}

export async function loadClients(): Promise<Client[]> {
  try {
    const raw = await AsyncStorage.getItem(CLIENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Client[];
    // Alphabetical — a client list is a register, not a feed.
    return parsed.sort((a, b) => a.name.localeCompare(b.name, 'da'));
  } catch (err) {
    console.warn('[storage] failed to load clients', err);
    return [];
  }
}

export async function saveClients(items: Client[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CLIENTS_KEY, JSON.stringify(items));
  } catch (err) {
    console.warn('[storage] failed to save clients', err);
  }
}
