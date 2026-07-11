const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const userId = '1b4b7868-711b-479a-94e7-b2e407167810';
  
  console.log("Deleting os_account_profiles...");
  let { error: err1 } = await supabase.from('os_account_profiles').delete().eq('account', userId);
  console.log("err1:", err1);

  console.log("Deleting os_profiles...");
  let { error: err2 } = await supabase.from('os_profiles').delete().eq('user_id', userId);
  console.log("err2:", err2);

  console.log("Deleting starseed_identities...");
  let { error: err3 } = await supabase.from('starseed_identities').delete().eq('owner', userId);
  console.log("err3:", err3);

  console.log("Deleting account_emails...");
  let { error: err4 } = await supabase.from('account_emails').delete().eq('user_id', userId);
  console.log("err4:", err4);

  console.log("Done");
}

main();
