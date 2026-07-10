require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
async function test() {
  const { data, error } = await supabase.rpc('get_policies', { table_name: 'os_account_profiles' });
  if (error) {
     const { data: d2, error: e2 } = await supabase.from('pg_policies').select('*').eq('tablename', 'os_account_profiles');
     console.log("Policies:", d2);
  } else {
     console.log("Policies:", data);
  }
}
test();
