const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function main() {
  const uid = '1b4b7868-711b-479a-94e7-b2e407167810';
  
  const insertPatch = { 
    user_id: uid, 
    username: "carlos_test_handle", 
    display_name: "Carlos Test", 
    searchable: true 
  };
  
  const res = await supabase.from("os_profiles").insert(insertPatch).select("*").single();
  console.log("Insert res:", res);
}
main();
