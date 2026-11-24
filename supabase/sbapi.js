import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const supabaseUrl = 'https://xwhrdqsoikmjvwoqgxge.supabase.co';
export const supabasePublishableKey = 'sb_publishable_u-YD5i4emmbRha1Er4IawQ_m8W-bFwJ';

// Publishable keys are intended for browser use. Protect data with RLS policies.
export const supabase = createClient(supabaseUrl, supabasePublishableKey);
