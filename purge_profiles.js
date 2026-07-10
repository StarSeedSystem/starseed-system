require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function purge() {
  await supabase.from('os_account_profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('os_profiles').delete().neq('user_id', '00000000-0000-0000-0000-000000000000');
  console.log("Profiles purged.");
}
purge();
