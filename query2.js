const { createClient } = require('@supabase/supabase-js');
// [REDACTADO:service_role_supabase] — nunca hardcodear la service_role (auditoría de seguridad 2026-07-12).
// Ejecutar con: SUPABASE_SERVICE_ROLE_KEY=... node query2.js  (la clave vive en .env.local, que está gitignorada)
const supabase = createClient('https://nxstilnyidvkqeosofuh.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: schema } = await supabase.rpc('execute_sql', { query: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'os_profiles';" });
  console.log("os_profiles columns:", schema);
}
run();
