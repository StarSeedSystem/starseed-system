const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function main() {
  const { data, error } = await supabase.rpc('get_policies'); // or just query pg_policies
  const res = await supabase.from('os_account_profiles').select('*').limit(1);
  console.log(res);
}
main();
