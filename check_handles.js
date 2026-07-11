const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function main() {
  const { data, error } = await supabase.from('os_account_profiles').select('handle, account');
  console.log("Error:", error);
  console.log("Handles:", data);
}
main();
