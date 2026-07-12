const { createClient } = require('@supabase/supabase-js');
// [REDACTADO:service_role_supabase] — nunca hardcodear la service_role (auditoría de seguridad 2026-07-12).
// Ejecutar con: SUPABASE_SERVICE_ROLE_KEY=... node query.js  (la clave vive en .env.local, que está gitignorada)
const supabase = createClient('https://nxstilnyidvkqeosofuh.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: users } = await supabase.auth.admin.listUsers();
  console.log("Users:", users.users.map(u => u.email));
  
  const { data: profiles } = await supabase.from('os_profiles').select('*');
  console.log("os_profiles:", profiles);

  const { data: facets } = await supabase.from('os_account_profiles').select('*');
  console.log("os_account_profiles:", facets);
}
run();
