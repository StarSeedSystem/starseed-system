import { createClient } from '@supabase/supabase-js';
const url = "https://nxstilnyidvkqeosofuh.supabase.co";
// [REDACTADO:service_role_supabase] — nunca hardcodear la service_role (auditoría de seguridad 2026-07-12).
// Ejecutar con: SUPABASE_SERVICE_ROLE_KEY=... node test_db.js  (la clave vive en .env.local, que está gitignorada)
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key);
async function run() {
  // Can't query supabase_migrations directly via REST API usually, but let's try.
  const { data, error } = await supabase.from('supabase_migrations.schema_migrations').select('*');
  console.log('migrations:', data || error);
}
run();
