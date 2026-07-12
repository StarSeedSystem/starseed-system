const { createClient } = require('@supabase/supabase-js');
// [REDACTADO:service_role_supabase] — nunca hardcodear la service_role (auditoría de seguridad 2026-07-12).
// Ejecutar con: SUPABASE_SERVICE_ROLE_KEY=... node test_update.js  (la clave vive en .env.local, que está gitignorada)
const supabase = createClient('https://nxstilnyidvkqeosofuh.supabase.co', process.env.SUPABASE_SERVICE_ROLE_KEY);

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
