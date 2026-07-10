require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
async function test() {
  const { data, error } = await supabase.from('os_account_profiles').insert({
    account: '8be339d0-bc1c-465b-a8e3-ee2193deb2fe', // The valid user_id from os_profiles
    name: 'Test',
    handle: 'test_handle_valid',
    visibility: 'public'
  }).select('*');
  console.log("Insert result:", error || data);
  if (!error) await supabase.from('os_account_profiles').delete().eq('handle', 'test_handle_valid');
}
test();
