const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function main() {
  const uid = '1b4b7868-711b-479a-94e7-b2e407167810';
  
  // 1. Try to fetch from os_account_profiles
  const { data: profs, error: err1 } = await supabase.from('os_account_profiles').select('*').eq('account', uid);
  console.log("Current profiles:", profs, err1);
  
  // 2. Fetch from os_profiles
  const { data: os_prof, error: err2 } = await supabase.from('os_profiles').select('*').eq('user_id', uid);
  console.log("os_profiles:", os_prof, err2);
}
main();
