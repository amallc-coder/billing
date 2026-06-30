import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// True only when both env vars are present. The UI uses this to show a
// configuration banner instead of crashing when Supabase isn't wired up yet.
export const isSupabaseConfigured = Boolean(url && anonKey)

// When unconfigured we still construct a client against a harmless placeholder
// so imports don't throw at module-load time; calls will simply fail until
// real credentials are provided in .env.
export const supabase = createClient(
  url || 'http://localhost:54321',
  anonKey || 'public-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  },
)

export const ATTACHMENTS_BUCKET = 'claim-attachments'
