const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function main() {
  const { data, error } = await supabase.rpc('execute_sql', { query: "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'os_profiles';" });
  console.log(data, error);
}
main();
