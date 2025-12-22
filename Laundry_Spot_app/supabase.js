// supabase.js
// Safe helper file — does NOT declare global variables

export function createSupabaseClient(url, anonKey) {
  return window.supabase.createClient(url, anonKey);
}
