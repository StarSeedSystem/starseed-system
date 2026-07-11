const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function main() {
  const { data, error } = await supabase.rpc('execute_sql', { query: `
    SELECT pol.polname, pol.polcmd, pol.polpermissive, pol.polroles, pol.polqual, pol.polwithcheck
    FROM pg_policy pol
    JOIN pg_class cls ON pol.polrelid = cls.oid
    WHERE cls.relname = 'os_account_profiles';
  ` });
  console.log("Error:", error);
  console.log("Data:", data);
}
main();
