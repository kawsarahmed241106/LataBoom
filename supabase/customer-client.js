import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { supabaseUrl, supabasePublishableKey } from './sbapi.js';

// Keep customer sessions separate from the admin client's browser session.
export const customerSupabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storageKey: 'brand-customer-auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
