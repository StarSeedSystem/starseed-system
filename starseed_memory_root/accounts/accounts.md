# 🔐 ACCOUNTS — Registro de Cuentas StarSeed (accounts.md)

> Inventario de cuentas y servicios del ecosistema.
> ⚠️ **No se guardan contraseñas ni tokens en texto plano.** Aquí solo
> identificadores y **dónde viven** los secretos.

## Identidad principal
- **Visionario:** Alex Bordón Garrigós — `alexbordongarrigos@gmail.com`.
- **Cuenta de prueba** (futura conexión de memorias a StarSeed): **Ester**.

## Plataformas
| Servicio | Cuenta / ID | Notas |
|---|---|---|
| GitHub | org `StarSeedSystem` · repo `starseed-system` | OS. Push con credenciales locales del Mac (`credential.helper=store`). |
| GitHub | `alexbordongarrigos/Starseed-Cafe` | Nexus / Café. |
| GitHub | `alexbordongarrigos/StarSeed-Nexus` | Nexus. |
| Vercel | StarSeed OS → `starseed-os.vercel.app` | Auto-deploy desde `main`. |
| Vercel | `starseed-nexus.vercel.app` · `audiomorphic.vercel.app` | Portal / Audiomorphic. |
| Supabase | `dzkjapinnewkxzjltadv` | Cuenta soberana unificada (OS / Nexus / Café). |
| Supabase | `nxstilnyidvkqeosofuh` | Migración referenciada (#33). |
| Google | `alexbordongarrigos@gmail.com` | Drive (memorias/documentos), Gemini. |
| Telegram | 7 canales/grupos (`src/lib/telegram-spaces.ts`) | 🧠 Exocórtex & IA = `-1004444519617`. |

## Secretos (NO en estas memorias)
Tokens/keys (Supabase service role, Vercel, Telegram bot, Gemini) viven en variables
de entorno (`.env` local / Vercel env). Se **referencian por nombre**, nunca por valor.
