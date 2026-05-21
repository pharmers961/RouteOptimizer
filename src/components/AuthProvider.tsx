import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, User } from '../utils/supabase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function init() {
      // Explicitly complete OAuth: read tokens from the URL hash, set the
      // session, then strip them from the URL. Don't rely solely on the
      // library's auto-detection, which isn't firing reliably here.
      try {
        const hash = window.location.hash;
        if (hash.includes('access_token=')) {
          const params = new URLSearchParams(hash.replace(/^#/, ''));
          const access_token = params.get('access_token');
          const refresh_token = params.get('refresh_token');
          if (access_token && refresh_token) {
            await supabase.auth.setSession({ access_token, refresh_token });
            window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
          }
        }
      } catch (err) {
        console.error('OAuth hash handling failed:', err);
      }

      try {
        const { data } = await supabase.auth.getSession();
        if (active) setUser(data.session?.user ?? null);
      } catch (err) {
        console.error('Auth init failed:', err);
      } finally {
        if (active) setLoading(false);
      }
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
