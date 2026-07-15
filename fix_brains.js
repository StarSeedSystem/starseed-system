import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.log("No user session found in context (run with service role if needed)");
    // Or we just get all brains that look like duplicates
  }
}
run();
