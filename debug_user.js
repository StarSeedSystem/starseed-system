const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function main() {
  const userResp = await supabase.auth.admin.listUsers();
  const users = userResp.data?.users || [];
  const alex = users.find(u => u.email === "carlosalexisnunez@gmail.com") || users[0];
  const uid = alex.id;
  
  console.log("Found user UID:", uid);
  
  // 1. Try to fetch from os_account_profiles with RLS logic (simulated by querying directly)
  const { data: profs, error: err1 } = await supabase.from('os_account_profiles').select('*').eq('account', uid);
  console.log("Current profiles:", profs, err1);
  
  // 2. Try to insert exactly like createProfile (with an empty handle, just in case)
  const input = {
      account: uid,
      name: "Prueba sin handle",
      handle: null,
      kind: "personal",
      avatar_url: null,
      cover_url: null,
      bio: null,
      visibility: "public",
      is_default: false,
  };
  
  const { data, error } = await supabase.from("os_account_profiles").insert(input).select();
  console.log("Insert Error:", error);
  console.log("Insert Data:", data);
}
main();
