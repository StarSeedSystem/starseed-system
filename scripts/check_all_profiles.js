const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function main() {
  const { data: d1 } = await supabase.from('os_account_profiles').select('*');
  console.log("ALL os_account_profiles:", d1);
  const { data: d2 } = await supabase.from('os_profiles').select('*');
  console.log("ALL os_profiles:", d2);
}
main();
