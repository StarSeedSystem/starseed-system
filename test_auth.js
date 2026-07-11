const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const supabaseClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function main() {
  const email = "test_agent_" + Date.now() + "@example.com";
  const password = "Password123!";
  
  // Create user
  const { data: user, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (createErr) {
    console.log("Create user error:", createErr);
    return;
  }
  
  // Login as user
  const { data: session, error: loginErr } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });
  
  if (loginErr) {
    console.log("Login error:", loginErr);
    return;
  }
  
  const uid = session.user.id;
  console.log("Logged in UID:", uid);
  
  // Test insert
  const input = {
      account: uid,
      name: "Prueba User",
      handle: "prueba_user_" + Date.now(),
      kind: "personal",
      visibility: "public",
      is_default: true,
  };
  
  const { data: insertData, error: insertErr } = await supabaseClient.from("os_account_profiles").insert(input).select();
  console.log("Insert Error:", insertErr);
  console.log("Insert Data:", insertData);
  
  // Test select
  const { data: selectData, error: selectErr } = await supabaseClient.from("os_account_profiles").select('*').eq('account', uid);
  console.log("Select Error:", selectErr);
  console.log("Select Data:", selectData);
}
main();
