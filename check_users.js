const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function main() {
  const userResp = await supabase.auth.admin.listUsers();
  const users = userResp.data?.users || [];
  console.log("Users:", users.map(u => ({ email: u.email, id: u.id, last_sign_in: u.last_sign_in_at })));
}
main();
