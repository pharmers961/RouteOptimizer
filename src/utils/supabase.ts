import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

// Tolerate accidental quotes / whitespace / missing scheme in the env value,
// and validate before handing it to createClient — an invalid URL otherwise
// throws synchronously and white-screens the whole app.
function normalizeUrl(raw?: string): string | null {
  if (!raw) return null;
  let v = raw.trim().replace(/^["']|["']$/g, '').trim();
  if (!v) return null;
  // Guard against pasting a Supabase API key into the URL field by mistake.
  if (/^sb_(publishable|secret)_/i.test(v) || /^eyJ/.test(v)) return null;
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    const url = new URL(v);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

const SUPABASE_URL = normalizeUrl(import.meta.env.VITE_SUPABASE_URL);
const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)
    ?.trim()
    .replace(/^["']|["']$/g, '')
    .trim() || undefined;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    'Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing or invalid). ' +
      'Sign-in and saved addresses are disabled until set. The URL must look like https://xxxx.supabase.co.',
  );
}

// Use a syntactically valid placeholder when unconfigured so createClient never
// throws; calls simply fail and isSupabaseConfigured gates the auth UI.
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL ?? 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY ?? 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

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
