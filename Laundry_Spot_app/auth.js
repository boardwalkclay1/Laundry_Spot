let supabaseClient = null;
let appConfig = null;

async function loadConfig() {
  if (appConfig) return appConfig;
  const res = await fetch('/config');
  appConfig = await res.json();
  return appConfig;
}

async function initSupabase() {
  if (supabaseClient) return supabaseClient;
  const cfg = await loadConfig();
  supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  return supabaseClient;
}

async function signupUser(email, password, role) {
  const supabase = await initSupabase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role } }
  });
  if (error) throw error;
  return data;
}

async function loginUser(email, password) {
  const supabase = await initSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  if (error) throw error;
  return data;
}

async function getCurrentUser() {
  const supabase = await initSupabase();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

async function logoutUser() {
  const supabase = await initSupabase();
  await supabase.auth.signOut();
}

function getRoleFromUser(user) {
  return user?.user_metadata?.role || null;
}
