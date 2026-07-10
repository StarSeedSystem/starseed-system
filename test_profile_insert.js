require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function test() {
  console.log("Checking os_account_profiles...");
  const { data, error } = await supabase.from('os_account_profiles').select('id, visibility').limit(1);
  if (error) console.error("Error os_account_profiles:", error.message);
  else console.log("os_account_profiles visibility works:", data);

  console.log("Checking os_profiles...");
  const { data: d2, error: e2 } = await supabase.from('os_profiles').select('user_id, visibility').limit(1);
  if (e2) console.error("Error os_profiles:", e2.message);
  else console.log("os_profiles visibility works:", d2);
  
  // Try inserting a fake account profile
  const fakeUid = '11111111-1111-1111-1111-111111111111';
  const { data: d3, error: e3 } = await supabase.from('os_account_profiles').insert({
    account: fakeUid,
    name: 'Test',
    handle: 'test_handle',
    visibility: 'public'
  }).select('*');
  if (e3) console.error("Insert os_account_profiles failed:", e3.message);
  else {
      console.log("Insert os_account_profiles success!");
      await supabase.from('os_account_profiles').delete().eq('account', fakeUid);
  }
}

test();
