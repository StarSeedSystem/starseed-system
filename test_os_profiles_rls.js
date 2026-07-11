const { createClient } = require('@supabase/supabase-js');
const supabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function main() {
  const email = "test_agent_" + Date.now() + "@example.com";
  const password = "Password123!";
  
  // 1. Create a raw user directly using service key to bypass email confirmation
  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: user, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  
  // 2. Login as user
  const { data: session, error: loginErr } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });
  
  const uid = session.user.id;
  
  // 3. Test insert into os_profiles
  const insertPatch = { 
    user_id: uid, 
    username: "test_os_profiles_" + Date.now(), 
    display_name: "Test RLS", 
    searchable: true 
  };
  
  const res = await supabaseClient.from("os_profiles").insert(insertPatch).select("*").single();
  console.log("os_profiles insert Error:", res.error);
  console.log("os_profiles insert Data:", res.data);
  
  // 4. Test update os_profiles
  const resUpdate = await supabaseClient.from("os_profiles").update({ display_name: "Updated RLS" }).eq('user_id', uid).select("*").single();
  console.log("os_profiles update Error:", resUpdate.error);
  console.log("os_profiles update Data:", resUpdate.data);
}
main();
