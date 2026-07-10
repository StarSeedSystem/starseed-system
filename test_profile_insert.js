const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function main() {
  const userResp = await supabase.auth.admin.listUsers();
  const users = userResp.data?.users || [];
  const alex = users.find(u => u.email === "carlosalexisnunez@gmail.com") || users[0];
  const id = alex.id;

  const input = {
      account: id,
      name: "Prueba Local",
      handle: "prueba_local_123",
      kind: "personal",
      visibility: "public",
      is_default: true,
  };

  const { data, error } = await supabase.from("os_account_profiles").insert(input).select();
  console.log("Error:", error);
  console.log("Data:", data);
}
main();
