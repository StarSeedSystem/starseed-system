const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data: d1 } = await supabase.from('os_account_profiles').select('*').limit(1);
  console.log("os_account_profiles cols:", d1 && d1[0] ? Object.keys(d1[0]) : "No data, can't infer");

  const { data: d2 } = await supabase.from('os_profiles').select('*').limit(1);
  console.log("os_profiles cols:", d2 && d2[0] ? Object.keys(d2[0]) : "No data");
  
  const { data: d3 } = await supabase.from('account_emails').select('*').limit(1);
  console.log("account_emails cols:", d3 && d3[0] ? Object.keys(d3[0]) : "No data");
}
main();
