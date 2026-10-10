import { supabase } from './supabase.js'

// Passing averages live in the account's user_metadata (no table); the saved session works offline.
export const getPassing = async () => (await supabase.auth.getSession()).data.session?.user?.user_metadata?.passing ?? {}
export const savePassing = passing => supabase.auth.updateUser({ data: { passing } })
