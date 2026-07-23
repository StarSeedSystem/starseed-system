// Re-login de la cuenta de prueba y genera public/inject.html (sin truncamiento).
// El HTML se sirve desde el MISMO origen que la app (next dev en puerto 3210)
// -> puede setear localStorage de Supabase y redirigir a /escritorios CON sesion.
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
const { data, error } = await supabase.auth.signInWithPassword({ email: creds.email, password: creds.password });
if (error) { console.error('LOGIN ERROR:', error.message); process.exit(1); }
const sess = data.session;
if (!sess) { console.error('NO SESSION'); process.exit(1); }

// Escribir inject.html con el token COMPLETO (Python-equivalent: fs.writeFileSync no trunca).
const ref = 'nxstilnyidvkqeosofuh';
const payload = {
  currentSession: {
    access_token: sess.access_token,
    refresh_token: sess.refresh_token,
    expires_in: 3600,
    expires_at: sess.expires_at,
    token_type: 'bearer',
    user: { id: data.user.id, aud: 'authenticated', role: 'authenticated' },
  },
  expiresAt: (sess.expires_at || 1784804957) * 1000,
};
const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script>
localStorage.setItem('sb-${ref}-auth-token', JSON.stringify(${JSON.stringify(payload)}));
location.href = '/escritorios';
</script>
</body></html>`;
fs.writeFileSync(path.join(__dirname, '..', 'public', 'inject.html'), html);
console.log('INJECT html escrito. token len:', (sess.access_token || '').length, '| user:', data.user.id);
