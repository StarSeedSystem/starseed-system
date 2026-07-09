const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://nxstilnyidvkqeosofuh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54c3RpbG55aWR2a3Flb3NvZnVoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjIzNTIyMSwiZXhwIjoyMDk3ODExMjIxfQ.4C51JMRc8GnN6KLtZf0nTQ299XzbkcgYzhY09BdVpjg');

async function run() {
  const { data: schema } = await supabase.rpc('execute_sql', { query: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'os_profiles';" });
  console.log("os_profiles columns:", schema);
}
run();
