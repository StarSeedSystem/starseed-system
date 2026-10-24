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

### 4.3 Modelos, topes y reanudación (CRM1024J/K · 2026-10-24)

- **Rueda de modelos** (`scripts/puente/cloudroom_modelos.py`): solo lo que la cuenta tiene EN LA NUBE
  (`room-cli cloud status --json`) más los modelos propios de Pi declarados en
  `config/cloudroom-pi-modelos.json`. Orden: Pi/opencode gratis (intercalados por proveedor) → Codex
  (< 80 % de su cuota, que es la del enjambre) → otros → Claude Code sonnet/haiku (semana < 30 %).
- **Proveedores de Pi en la nube**: los escribe `scripts/cloudroom/setup-nube.sh` en `~/.pi/agent/models.json`
  de cada sandbox (`room-cli cloud setup set < scripts/cloudroom/setup-nube.sh`): NIM (`$NVIDIA_API_KEY`),
  xKiro (`$XKIRO_API_KEY`, con su User-Agent) y Gemini OpenAI-compatible (`$GEMINI_API_KEY`); Mistral es un
  proveedor que Pi ya trae (`MISTRAL_API_KEY`). Solo admiten el razonamiento «none».
- **Un modelo solo entra si su clave está en la nube** (`claves` de la config frente a `room-cli cloud env
  list --json`, que da solo NOMBRES). Las claves las pone Alex (`room-cli cloud env set NOMBRE`, el valor por
  la entrada estándar); nunca el OpenRouter de crédito, xAI, DeepSeek, Anthropic ni Explabs.
- **Tope de hilos a la vez por proveedor gratuito** (`simultaneos`: NIM 2, xKiro 2, Gemini 1, Mistral 1;
  2 si no se dice). Medido el 2026-10-24: 15 hilos de Pi a la vez contra NIM → los 15 parados con «429 Too
  Many Requests» (la clave es la misma que usan el enjambre de la Mac y el de GitHub Actions). Lo que no cabe
  espera a la próxima pasada sin marcarse ni gastar cupo.
- **Reanudar antes que perder** (`seguir`): un hilo terminado cuyo log ACABA en un corte del proveedor (429,
  5xx, saturado) o de su modelo (404/410, sin clave) se reanuda con `room-cli thread tell` —el MISMO hilo, no
  gasta otro de los 100 del ciclo—: con otro proveedor del mismo harness si lo hay; con el mismo modelo tras
  20 min parado; con otro modelo si el suyo no existe (la nube contesta 409 «model just changed» y el mensaje
  se reenvía). Hasta 3 veces y dentro de las 12 h de gracia; después, lo de siempre (diff-patch o devolver).
- **El medidor «Agentes» dice la verdad**: cada pasada de `seguir` anota `visto` {estado, t, corte} en
  `~/.starseed/cloudroom-hilos.json`; Genesis pinta «esperando modelo» (corte de cupo o de modelo) o «sin
  escribir» (terminó; MetaGenesis trae su rama o lo devuelve) en vez de «escribiendo» a ciegas.

## 5. Reglas

- Privacidad: el sandbox recibe una COPIA del proyecto. Nada privado-local (memoria personal, claves,
  datos de otras personas) se manda a la nube de Cloudroom sin consentimiento explícito del contexto;
  los grupos/páginas públicos solo con su código público.
- Claves: las pone su dueño en la app (`room-cli cloud env`); el OS solo guarda NOMBRES de variable.
- Nada de cuentas creadas por agentes; el inicio de sesión lo hace la persona.
- Honestidad: si la neurona no tiene la app o la cuenta no tiene cupo, se dice y se ofrece la siguiente
  opción (local, A1, GitHub Actions, sesiones de Claude en la nube…).
- Cola del enjambre: `starseed_memory_root/olas/cola-cloudroom-1024.json` (ola 1024C, CRM1024A–F).
