const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function main() {
  const userId = 'b3f263b9-87d8-4816-99af-2d26915dc591'; // A test user
  await supabase.from('os_profiles').insert({
    user_id: userId,
    username: 'maggasukha',
    display_name: 'Maggasukha',
    searchable: true,
    kind: 'personal',
    is_default: true
  });
  console.log("Done");
}
main();
