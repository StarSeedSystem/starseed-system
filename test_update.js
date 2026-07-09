const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://nxstilnyidvkqeosofuh.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im54c3RpbG55aWR2a3Flb3NvZnVoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjIzNTIyMSwiZXhwIjoyMDk3ODExMjIxfQ.4C51JMRc8GnN6KLtZf0nTQ299XzbkcgYzhY09BdVpjg');

async function run() {
  const user_id = '8be339d0-bc1c-465b-a8e3-ee2193deb2fe'; // The user from the DB earlier
  
  let patch = {
      display_name: 'Maggasukha',
      handle: 'maggasukha',
      bio: 'Semillita estelar 🌟',
      searchable: true
  };

  try {
      let { data, error } = await supabase
          .from("os_profiles")
          .update(patch)
          .eq("user_id", user_id)
          .select("*")
          .single();
      
      console.log("Update try:", { data, error });
      
      if (error && error.code === 'PGRST116') {
          console.log("No profile exists yet, inserting...");
          const insertPatch = { ...patch, user_id };
          const res = await supabase
              .from("os_profiles")
              .insert(insertPatch)
              .select("*")
              .single();
          data = res.data;
          error = res.error;
          console.log("Insert result:", { data, error });
      }

  } catch (e) {
      console.log("Exception:", e);
  }
}
run();
