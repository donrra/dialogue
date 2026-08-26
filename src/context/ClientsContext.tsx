/**
 * Holds the client (patient) register in memory and keeps AsyncStorage in sync.
 * Mirrors ConversationsContext so screens use the same patterns.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { loadClients, saveClients } from '@/lib/storage';
import { makeId } from '@/lib/id';
import type { Client } from '@/lib/types';

interface ClientsValue {
  clients: Client[];
  loading: boolean;
  getById: (id: string) => Client | undefined;
  /** Creates a client with the next free color and returns it. */
  create: (name: string) => Client;
  remove: (id: string) => void;
}

const ClientsContext = createContext<ClientsValue | null>(null);

export function ClientsProvider({ children }: { children: React.ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    loadClients().then((items) => {
      if (!mounted) return;
      setClients(items);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!loading) saveClients(clients);
  }, [clients, loading]);

  const getById = useCallback(
    (id: string) => clients.find((c) => c.id === id),
    [clients],
  );

  const create = useCallback(
    (name: string): Client => {
      const client: Client = {
        id: makeId('k_'),
        name: name.trim(),
        colorIndex: clients.length,
        createdAt: Date.now(),
      };
      setClients((prev) =>
        [...prev, client].sort((a, b) => a.name.localeCompare(b.name, 'da')),
      );
      return client;
    },
    [clients.length],
  );

  const remove = useCallback((id: string) => {
    setClients((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const value = useMemo(
    () => ({ clients, loading, getById, create, remove }),
    [clients, loading, getById, create, remove],
  );

  return <ClientsContext.Provider value={value}>{children}</ClientsContext.Provider>;
}

export function useClients(): ClientsValue {
  const ctx = useContext(ClientsContext);
  if (!ctx) {
    throw new Error('useClients must be used inside ClientsProvider');
  }
  return ctx;
}
