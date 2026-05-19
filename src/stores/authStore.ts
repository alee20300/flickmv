import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { UserProfile } from '../types/app';
import { supabase } from '../lib/supabase';

interface AuthState {
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  initialized: boolean;
  setSession: (session: Session | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setLoading: (loading: boolean) => void;
  setInitialized: (v: boolean) => void;
  fetchProfile: (userId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  profile: null,
  loading: true,
  initialized: false,

  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),
  setInitialized: (initialized) => set({ initialized }),

  fetchProfile: async (userId: string) => {
    const { data } = await supabase.from('users').select('*').eq('id', userId).single();
    if (data) set({ profile: data as UserProfile });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, profile: null });
  },
}));
