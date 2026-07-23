// Login programatico de la cuenta de prueba SIN OTP (email+password).
// Usa la anon key del .env.local (debe coincidir con la de Vercel, ya corregida).
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
const get = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();

const url = get('NEXT_PUBLIC_SUPABASE_URL');
const anon = get('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const creds = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'test-account-creds.json'), 'utf8'));

const supabase = createClient(url, anon);
const { data, error } = await supabase.auth.signInWithPassword({
  email: creds.email,
  password: creds.password,
});
if (error) {
  console.error('LOGIN ERROR:', error.message, '| status', error.status);
  process.exit(1);
}
console.log('LOGIN OK -> user', data.user?.id, '| session expires', data.session?.expires_at);
// Guarda el access_token para usarlo en el navegador (localStorage) si hace falta.
const out = { access_token: data.session?.access_token, refresh_token: data.session?.refresh_token, user_id: data.user?.id };
fs.writeFileSync(path.join(__dirname, '..', 'test-account-session.json'), JSON.stringify(out, null, 2));
console.log('Session guardada en test-account-session.json (NO commitear).');
