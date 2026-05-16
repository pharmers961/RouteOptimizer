import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Fail loudly during local dev; in prod the deploy will already have
  // surfaced the env vars on Netlify before running the build.
  // eslint-disable-next-line no-console
  console.warn(
    'Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. ' +
      'Auth and saved-addresses features will be disabled until configured.',
  );
}

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL ?? 'http://invalid.local',
  SUPABASE_ANON_KEY ?? 'invalid-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export async function signInWithGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export type { User };

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
}

export function logSupabaseError(error: unknown, operation: OperationType, table: string): void {
  // eslint-disable-next-line no-console
  console.error('Supabase error', {
    operation,
    table,
    message: error instanceof Error ? error.message : String(error),
  });
}
