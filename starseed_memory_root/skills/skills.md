# 🛠️ SKILLS — Habilidades, APIs, Plugins & Instrucciones (skills.md)

> Capacidades de StarSeed / Aurora / Astraura + **APIs** + **plugins** + instrucciones de uso.

## Hub de Habilidades (en el OS)
Skills, tools, MCPs, plugins, conexiones y APIs son **attachables** a cerebros,
lienzos y apps (Módulo 10 · Hub de Conexiones).

## Skills del repo (`.agent/skills/`)
`shadcn-ui` · `design-md` · `react-components` · `enhance-prompt` · `stitch-loop` · `remotion`.

## APIs / Servicios (con instrucciones)
| API / Servicio | Uso | Cómo se usa |
|---|---|---|
| **Supabase** | auth · realtime · datos | cliente en `src/utils/supabase`; proyecto soberano `dzkjapinnewkxzjltadv` |
| **Vercel** | despliegue del OS | `git push` a `main` → auto-deploy |
| **Gemini / Genkit** | IA texto/imagen/vídeo | `src/ai/*`; endpoint de imagen de elixir en el bot |
| **Telegram** | canales/espacios | `src/lib/telegram-spaces.ts`; bot externo (token en env) |
| **Google Drive** | memorias / documentos | carpeta *Sistema de Memoria StarSeed* |

## Plugins / Conexiones
- MCPs, plugins y APIs se conectan vía **Hub de Conexiones** (Módulo 10) y se attachan a cerebros/lienzos/apps.
- **Sentidos de Aurora:** micrófono · cámara · pantalla · ubicación · portapapeles.

## Instrucciones de skills
- **Añadir un skill:** definirlo y attachearlo a un cerebro/lienzo/app desde el Hub.
- **Proveedor de IA por chat (futuro #95):** Ollama local + cualquier API, con auto-selección por Aurora.
- **Memorias como skill:** este Sistema de Memoria es montable como baúl de un cerebro (ver `sync.md`).
