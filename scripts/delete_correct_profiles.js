const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function main() {
  const userId = '8be339d0-bc1c-465b-a8e3-ee2193deb2fe';
  console.log("Deleting for user", userId);
  await supabase.from('os_account_profiles').delete().eq('account', userId);
  await supabase.from('os_profiles').delete().eq('user_id', userId);
  await supabase.from('starseed_identities').delete().eq('owner', userId);
  await supabase.from('account_emails').delete().eq('user_id', userId);
  console.log("Done");
}
main();
