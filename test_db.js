import { createClient } from '@supabase/supabase-js';
const url = "https://nxstilnyidvkqeosofuh.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54c3RpbG55aWR2a3Flb3NvZnVoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjIzNTIyMSwiZXhwIjoyMDk3ODExMjIxfQ.4C51JMRc8GnN6KLtZf0nTQ299XzbkcgYzhY09BdVpjg";
const supabase = createClient(url, key);
async function run() {
  // Can't query supabase_migrations directly via REST API usually, but let's try.
  const { data, error } = await supabase.from('supabase_migrations.schema_migrations').select('*');
  console.log('migrations:', data || error);
}
run();
