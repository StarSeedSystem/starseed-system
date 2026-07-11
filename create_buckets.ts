import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
const env = fs.readFileSync(".env.local", "utf-8").split("\n");
let url = ""; let key = "";
for (const line of env) {
  if (line.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) url = line.split("=")[1];
  if (line.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) key = line.split("=")[1];
}
const supabase = createClient(url, key);
async function run() {
  const b1 = await supabase.storage.createBucket("os-files", { public: true });
  const b2 = await supabase.storage.createBucket("os-media", { public: true });
  console.log(b1, b2);
}
run();
