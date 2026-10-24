# Cloudroom como servidor de agentes (SOP · 2026-10-24)

> Alex (2026-10-24): «instala esto para MetaGenesis y para los agentes de los usuarios y grupos
> privados y públicos de StarSeed OS como opción disponible, considerando lo que ofrece
> gratuitamente, usado inteligentemente, administrado y repartido por cada contexto de agente donde
> se use para los créditos disponibles de cada cuenta con su plan (gratis o cualquiera); solo debe
> ser una opción más para los servidores de los agentes aparte de las demás opciones configurables
> (locales o externas, de cualquier medio de servidor), sugerida cuando es relevante y lo soporta su
> contexto de sistema».

## 1. Qué es (verificado el 2026-10-24)

- App de escritorio (macOS Apple Silicon ≥ 13, Linux x64 en alfa) que ejecuta agentes de código
  (Claude Code, Codex, opencode, Pi, Cursor, Hermes…) **en local o en sandboxes en la nube**: cada
  agente con su sandbox aislado y su propia rama de git; los de la nube siguen aunque se cierre el
  portátil. Núcleo abierto (`davidondrej/cloudroom-core`, Rust + PostgreSQL; autoalojamiento aún sin
  guía) y app en `davidondrej/cloudroom-gui`.
- **Lo gratis:** agentes **locales gratis siempre**; **100 agentes en la nube cada 30 días** por cuenta.
  Planes Pro 50 $/mes, Super 150 $/mes y Ultra 500 $/mes («más», sin cifras publicadas). Los modelos
  se pagan aparte: cada agente usa las cuentas/claves de su dueño (Cloudroom no factura las llamadas).
- **Datos:** al conectar un proyecto se copia al sandbox y se guarda el historial de la conversación.
  Las claves se ponen en la app (`room-cli cloud env`), nunca en un chat.

## 2. Instalado en la Mac de Alex

| | |
|---|---|
| App | `/Applications/Cloudroom.app` v119.0.0 (gui-v119-beta), 713 MB |
| Instalador | `Cloudroom-v119-arm64.dmg` de la release oficial; SHA-256 `31d14668…59cbf8` = `SHA256SUMS.txt` de la release; firmado «Developer ID Application: David Ondrejek (4AJ9HF33Z5)» y **notarizado** (spctl: accepted) |
| CLI | `~/.local/bin/room-cli` (enlace a la app); `room-cli status --json` → servidor local `127.0.0.1:<puerto>`, datos en `~/.gui-cloudroom` |
| Pendiente de Alex (en la app, no en un chat) | iniciar sesión en cloudroom.dev, conectar un agente (Claude Code / Codex), conectar GitHub, abrir la carpeta `/Users/alex/Documents/starseed-os-main` |

## 3. La CLI que usará el OS (`room-cli`)

`status --json` · `cloud status|check|github|env|repo|setup|auto-delete` · `thread spawn|wait|list|count|fork|worktree|context` ·
`environment list|show|status|diff|diff-files|diff-patch|commit` · `machine list|show|providers` · `provider list|models`.
Para el OS: `thread spawn` (encargo) → `thread wait` → `environment diff-patch` (el resultado como
parche, que entra por las MISMAS puertas que la nube: tsc, pruebas, revisión, `traer_nube`).

## 4. Dónde entra (una opción más, nunca la única)

1. **Catálogo de contenedores de agentes** (`src/lib/genesis/conectores/contenedores.ts` +
   `sugerir.ts`): entrada `cloudroom`, gratis con cupo (100 en la nube / 30 días por cuenta; local sin
   cupo), requisitos a la vista (app de escritorio en macOS Apple Silicon o Linux x64, cuenta de
   Cloudroom, GitHub y un agente conectado). Se **sugiere** solo si el contexto lo soporta (neurona con
   la app, agente de código, repositorio git) y es relevante (tarea de código larga o que debe seguir
   con el aparato apagado). En web pública o móvil: no se ofrece.
2. **Reparto del cupo por contexto** (módulo puro `cupo-cloudroom.ts`): el cupo de la CUENTA se reparte
   entre sus contextos (personal, cada grupo y página, privados o públicos) con ritmo diario
   (cupo restante ÷ días que quedan del ciclo; nunca agotar antes del reinicio), reserva para lo que
   pida la persona y libro de consumo por contexto. Plan gratis por defecto; los de pago, con cifras
   que declara la persona (no se inventan).
3. **MetaGenesis**: un medio más en `medios_disponibles.py` (`medio_cloudroom.py`: sonda de
   `room-cli status/cloud status/thread count`), y lanzamiento de tareas a hilos de la nube de
   Cloudroom con el ritmo del cupo (≈ 3/día en el plan gratis) y el resultado por `diff-patch` a las puertas.

## 5. Reglas

- Privacidad: el sandbox recibe una COPIA del proyecto. Nada privado-local (memoria personal, claves,
  datos de otras personas) se manda a la nube de Cloudroom sin consentimiento explícito del contexto;
  los grupos/páginas públicos solo con su código público.
- Claves: las pone su dueño en la app (`room-cli cloud env`); el OS solo guarda NOMBRES de variable.
- Nada de cuentas creadas por agentes; el inicio de sesión lo hace la persona.
- Honestidad: si la neurona no tiene la app o la cuenta no tiene cupo, se dice y se ofrece la siguiente
  opción (local, A1, GitHub Actions, sesiones de Claude en la nube…).
- Cola del enjambre: `starseed_memory_root/olas/cola-cloudroom-1024.json` (ola 1024C, CRM1024A–F).
