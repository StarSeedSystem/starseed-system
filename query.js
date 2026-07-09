const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://nxstilnyidvkqeosofuh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54c3RpbG55aWR2a3Flb3NvZnVoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjIzNTIyMSwiZXhwIjoyMDk3ODExMjIxfQ.4C51JMRc8GnN6KLtZf0nTQ299XzbkcgYzhY09BdVpjg');

async function run() {
  const { data: users } = await supabase.auth.admin.listUsers();
  console.log("Users:", users.users.map(u => u.email));
  
  const { data: profiles } = await supabase.from('os_profiles').select('*');
  console.log("os_profiles:", profiles);

  const { data: facets } = await supabase.from('os_account_profiles').select('*');
  console.log("os_account_profiles:", facets);
}
run();
