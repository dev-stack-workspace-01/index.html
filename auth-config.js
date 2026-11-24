window.BATHLY_AUTH_CONFIG = {
  adminEmail: "shehabmuo@gmail.com",
  // Add the Project URL and public anon/publishable key from Supabase here.
  supabaseUrl: "https://xptiysrubbixrcoxlxrb.supabase.co",
  supabaseAnonKey: "sb_publishable_p1LNcIMxpBeuRyn18ghmHA_XJ-CnUeM",
};

window.BATHLY_SUPABASE_CLIENT =
  window.BATHLY_AUTH_CONFIG.supabaseUrl &&
  window.BATHLY_AUTH_CONFIG.supabaseAnonKey &&
  window.supabase?.createClient
    ? window.supabase.createClient(
        window.BATHLY_AUTH_CONFIG.supabaseUrl,
        window.BATHLY_AUTH_CONFIG.supabaseAnonKey,
        {
          auth: {
            storage: window.sessionStorage,
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        },
      )
    : null;
