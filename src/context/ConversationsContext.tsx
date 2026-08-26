/**
 * Holds the list of conversations in memory and keeps AsyncStorage in sync.
 * Every screen reads/writes conversations through this context.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { loadConversations, saveConversations } from '@/lib/storage';
import type { Conversation } from '@/lib/types';

interface ConversationsValue {
  conversations: Conversation[];
  loading: boolean;
  getById: (id: string) => Conversation | undefined;
  upsert: (conversation: Conversation) => void;
  update: (id: string, patch: Partial<Conversation>) => void;
  remove: (id: string) => void;
}

const ConversationsContext = createContext<ConversationsValue | null>(null);

export function ConversationsProvider({ children }: { children: React.ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    loadConversations().then((items) => {
      if (!mounted) return;
      // Self-heal: a conversation left in "recording" can only be stale on a fresh
      // launch (live recording state lives in memory). If it captured audio, mark it
      // recorded; otherwise it never really started, so drop it.
      const healed = items.flatMap((c) => {
        if (c.status !== 'recording') return [c];
        if (c.audioUri) return [{ ...c, status: 'recorded' as const }];
        return [];
      });
      setConversations(healed);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Persist whenever the list changes (after the initial load).
  useEffect(() => {
    if (!loading) saveConversations(conversations);
  }, [conversations, loading]);

  const getById = useCallback(
    (id: string) => conversations.find((c) => c.id === id),
    [conversations],
  );

  const upsert = useCallback((conversation: Conversation) => {
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === conversation.id);
      if (idx === -1) return [conversation, ...prev];
      const next = [...prev];
      next[idx] = conversation;
      return next;
    });
  }, []);

  const update = useCallback((id: string, patch: Partial<Conversation>) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const value = useMemo(
    () => ({ conversations, loading, getById, upsert, update, remove }),
    [conversations, loading, getById, upsert, update, remove],
  );

  return (
    <ConversationsContext.Provider value={value}>
      {children}
    </ConversationsContext.Provider>
  );
}

export function useConversations(): ConversationsValue {
  const ctx = useContext(ConversationsContext);
  if (!ctx) {
    throw new Error('useConversations must be used inside ConversationsProvider');
  }
  return ctx;
}
