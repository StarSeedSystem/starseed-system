const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const uid = '1b4b7868-711b-479a-94e7-b2e407167810'; // Carlos' ID

  console.log("Deleting os_account_profiles...");
  const p1 = await supabase.from('os_account_profiles').delete().eq('account', uid);
  console.log("Deleted facet profiles:", p1.error || "Success");

  console.log("Deleting os_profiles...");
  const p2 = await supabase.from('os_profiles').delete().eq('user_id', uid);
  console.log("Deleted sovereign profile:", p2.error || "Success");

  console.log("Deleting starseed_identities...");
  const p3 = await supabase.from('starseed_identities').delete().eq('owner', uid);
  console.log("Deleted identities:", p3.error || "Success");
}
main();
