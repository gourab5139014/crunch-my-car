import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Primary client for the application data in the 'app' schema
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: 'app'
  }
})

// Dedicated client for Supabase Auth UI (which expects the 'public' schema)
export const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey)
