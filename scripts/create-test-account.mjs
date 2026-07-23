// Crea una cuenta de prueba en Supabase (OS) usando SOLO la anon key (pub) del .env.local.
// No usa ninguna clave secreta. Guarda las creds en test-account-creds.json (gitignored).
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();

const url = get('NEXT_PUBLIC_SUPABASE_URL');
const anon = get('NEXT_PUBLIC_SUPABASE_ANON_KEY');
if (!url || !anon) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL/ANON_KEY'); process.exit(1); }

const email = `test.starseed.${Date.now()}@star.seed`;
const password = `T3st-${Math.random().toString(36).slice(2, 10)}!`;
const username = `test_seed_${Math.floor(Math.random() * 9000 + 1000)}`;

const supabase = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });

const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { username, full_name: 'Test Seed' } } });
if (error) { console.error('SIGNUP ERROR:', error.message); process.exit(1); }

const creds = {
  email, password, username,
  userId: data.user?.id,
  createdAt: new Date().toISOString(),
  note: 'Cuenta de prueba StarSeed OS generada por el agente para verificacion en vivo.',
};
fs.writeFileSync(path.join(__dirname, '..', 'test-account-creds.json'), JSON.stringify(creds, null, 2));
console.log('CUENTA CREADA:', JSON.stringify({ email, username, userId: creds.userId }, null, 2));
console.log('Creds guardadas en test-account-creds.json (NO commitear).');
