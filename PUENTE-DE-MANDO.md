# Genesis · contexto compartido de los cuatro entornos

> Generado por `scripts/puente/sincronizar-ides.py` el 2026-10-08 10:07:15 desde Genesis vivo.
> **No lo edites a mano: se regenera.** Lo permanente va en `CLAUDE.md` y en `AGENTS.md`.

Este archivo es el primer mensaje del chat principal en **Claude (Cowork)**, **Codex**,
**Hermes** y **Antigravity IDE**. Los cuatro miran el mismo Genesis y dan órdenes por el
mismo canal, así que ninguno necesita que otro le resuma nada.

## Estado ahora mismo

| | |
|---|---|
| Genesis | **encendido** en http://127.0.0.1:9002/mando |
| Ola arriba | reintentos-2026-09-21 |
| Agentes escribiendo | **0** |
| En esta ola | integradas 18 · en curso 0 · esperando aprobación 0 · pendientes 0 |
| Últimas 4 olas | en curso 0 · pendientes 0 · integradas 35 |
| HEAD | `f66e1f7b chore(memoria): aprendizaje de la ola auto-1008-060009` |
| Sin publicar | 23 commits |
| Árbol | limpio |

## Quién escribe ahora (latido de `cola-auto-1008-060009.json`, hace 8s)

| tarea | fase | modelo | lleva | quieto | bytes |
|---|---|---|---|---|---|
| `RTCAMR1005Bb` | hecho | freellmapi/auto | 5 min | 272 s | 39117 |
| `ES1010Rb` | hecho | freellmapi/auto | 11 min | 653 s | 42447 |
| `PT1009C` | hecho | freellmapi/auto | 16 min | 959 s | 90939 |
| `CAMR1005D` | hecho | freellmapi/auto | 18 min | 1087 s | 167177 |
| `ES1010Qb` | hecho | freellmapi/auto | 19 min | 1127 s | 44612 |
| `RTCAMR1005B` | hecho | freellmapi/auto | 35 min | 2120 s | 815 |
| `CPA1007K` | hecho | freellmapi/auto | 36 min | 2188 s | 159376 |
| `CAMR1005C` | hecho | nvidia/moonshotai/kimi-k3 | 76 min | 4568 s | 56681 |
| `CAMR1005B` | hecho | nvidia/moonshotai/kimi-k3 | 78 min | 4674 s | 154348 |
| `FLU1005Hc` | hecho | nvidia/moonshotai/kimi-k3 | 81 min | 4886 s | 251607 |
| `DIS1005E` | hecho | nvidia/moonshotai/kimi-k3 | 102 min | 6094 s | 341069 |
| `CU3bs` | hecho | freellmapi/auto | 106 min | 6361 s | 237131 |
| `CPA1007Jb` | hecho | freellmapi/auto | 121 min | 7233 s | 111225 |
| `TK2c` | hecho | nvidia/moonshotai/kimi-k3 | 134 min | 8035 s | 1362808 |
| `p316Ic` | hecho | codex/gpt-5.6-sol | 135 min | 8078 s | 2285416 |
| `RM4` | hecho | nvidia/moonshotai/kimi-k3 | 143 min | 8560 s | 1567457 |
| `R7c` | hecho | nvidia/deepseek-ai/deepseek-v4-pro | 145 min | 8724 s | 353723 |
| `DR0919-1` | hecho | freellmapi/auto | 146 min | 8736 s | 111316 |
| `PRD1005S` | hecho | apinex/free/gemini-3.8-flash | 153 min | 9172 s | 613895 |
| `p314Acs` | hecho | nvidia/moonshotai/kimi-k3 | 157 min | 9418 s | 893080 |
| `CDV1004Cs` | hecho | nvidia/moonshotai/kimi-k3 | 164 min | 9825 s | 1049031 |
| `RM3` | hecho | nvidia/moonshotai/kimi-k3 | 172 min | 10292 s | 1692156 |
| `DIS1005N` | hecho | freellmapi/auto | 186 min | 11155 s | 93143 |
| `PT1009A` | hecho | freellmapi/auto | 198 min | 11884 s | 181010 |
| `DR1007-1` | hecho | codex/gpt-5.6-sol | 203 min | 12190 s | 21922 |
| `DR1007-2` | hecho | nvidia/moonshotai/kimi-k3 | 204 min | 12247 s | 34518 |
| `PT1008C` | hecho | codex/gpt-5.6-sol | 210 min | 12606 s | 604186 |
| `p318Jc` | hecho | nvidia/deepseek-ai/deepseek-v4-pro | 210 min | 12622 s | 549483 |
| `PRD1005T` | hecho | freellmapi/auto | 216 min | 12932 s | 1028482 |
| `CAMR1005A` | hecho | codex/gpt-5.6-sol | 237 min | 14199 s | 2065370 |

**Quieto por encima de 300 s con los bytes parados = API colgada, no modelo lento.**
Suéltala y dásela a un agente del IDE: `starseed-puente soltar <id>`.

## Cómo dirige cada IDE (idéntico en los cuatro)

```
starseed-puente estado                # foto viva
starseed-puente agentes               # quién escribe y desde hace cuánto
starseed-puente aprobar  <id> [...]   # desbloquea la puerta humana
starseed-puente soltar   <id> [...]   # la tarea pasa a un agente del IDE
starseed-puente reasignar <id> <modelo>
starseed-puente puertas               # tsc · vitest · build · sin publicar
```

Las órdenes se escriben en `starseed_memory_root/olas/control-<cola>.json`, que el
vigilante del orquestador lee **cada 20 s**. Da igual quién la escriba: es el mismo canal.

## Reglas que valen para los cuatro

- **Un solo orquestador** (`starseed-enjambre.py`) con N trabajadores. Tres procesos a la
  vez = tres `tsc` simultáneos = la Mac de rodillas. Los AGENTES sí se multiplican: cuantos
  más, mejor, mientras cada uno trabaje en su propio worktree.
- **Nunca `next build` con el enjambre vivo.** La Mac es de 8 GB.
- Tres puertas antes de publicar: `tsc --noEmit`, `vitest run`, `next build` completo.
- **Nada está hecho hasta que se ve en Genesis de la Mac.**
- Claves solo en archivos de entorno (`~/.hermes/.env`, `~/.starseed/env`). En el repo,
  en documentos y en los latidos, solo NOMBRES de variable. En `opencode.json`, `{env:VAR}`.
- Nunca `amend`, `rebase` ni `force-push` para cambiar autoría.
- Cada tarea escribe un módulo puro NUEVO y pequeño; el cableado va aparte.
- Los `id` de tarea son únicos en todo el histórico **y** entre los archivos de cola vivos.

## Dónde está cada cosa

| | |
|---|---|
| Repo | `/Users/alex/Documents/starseed-os-main` |
| Rumbo y reglas permanentes | `CLAUDE.md` (Claude) · `AGENTS.md` (Codex, Antigravity) · `gemini.md` |
| Estado del enjambre | `starseed_memory_root/olas/` — **no se versiona**, muere con la máquina |
| Orquestador | `scripts/enjambre/starseed-enjambre.py`, instalado en `~/.local/bin/` |
| Genesis | `http://127.0.0.1:9002/mando` — local, `/api/mando/*` devuelve 404 en producción |
| Publicado | https://starseed-os.vercel.app |

## Cómo se trabaja aquí

Esto es el MÉTODO, no el estado. Vale igual en Claude, Hermes, Codex, Cursor, VS Code o
Antigravity: quien abra un chat sobre este repo trabaja así. Lo escribe Genesis y
se regenera solo — no lo edites a mano; el original es `memory/workflow-actual.md`.

### Quién escribe qué

El **enjambre escribe el código de producto**. Los asistentes (Claude, Hermes, Codex…)
dirigen, verifican y publican: diseñan olas, las lanzan, miran Genesis, comprueban en
`localhost` y aprueban. No se escribe código de producto a mano salvo para DESHACER una
regresión. Esto lo pidió Alex expresamente y no es negociable.

**Acceso de edición total del programa: `maggasukha@star.seed`.** Hoy es la única cuenta con
acceso de desarrollador. Nuevos desarrolladores solo por votación de los que ya lo son.

### Las puertas de una tarea, en orden

alcance → **cableado** → tsc (+reparación) → vitest con el alcance de la tarea (+reparación) →
revisión de segunda opinión → integración.

Antes de arrancar el orquestador: **puerta de pasarelas** (no arranca si ninguna escribe) y
guardia de árbol limpio (no arranca con `main` sucio, pero ya no tropieza con su propia
contabilidad).

Antes de publicar, las cuatro: `npx tsc --noEmit` · `npx vitest run` · `python3 -m unittest
discover -s scripts/puente -p 'test_*.py'` · `npx next build`. Con el node del repo
(`~/.nvm/versions/node/v22.14.0/bin` primero en el PATH) y `NODE_OPTIONS=--max-old-space-size=4096`.

### Las cinco reglas que costaron un día entero cada una

1. **El silencio no es aprobación.** Un `vitest` que no imprime su resumen no ha comprobado
   nada. Repítelo sin tuberías y léelo entero.
2. **Integrado no es aplicado.** Exportar una función que nadie llama es código muerto con
   aspecto de trabajo terminado. Antes de darte por terminado, `grep` que se usa fuera de su
   prueba.
3. **Si una prueba falla, se arregla el CÓDIGO, no la prueba.** Mover la referencia de un test
   hasta que le dé la razón al fallo no es arreglar: es esconderlo. (Pasó de verdad con la
   fecha de Cultura, dos veces.)
4. **Una pasarela está viva cuando devuelve tokens**, no cuando contesta a un ping. Sin clave,
   las pasarelas no dan error: dan silencio, y el silencio se parece a un agente pensando.
5. **Las claves no se teclean en un chat.** Se guardan con
   `bash scripts/puente/guardar-clave.sh NOMBRE_VARIABLE`, que entrecomilla, hace copia y
   comprueba que el archivo sigue cargándose entero. Nunca en el repo, ni en logs, ni en
   eventos, ni en memorias: solo el nombre de la variable y su huella.

### Proveedores

`python3 scripts/puente/renovador-pasarelas.py [--telegram] [--abrir]` dice el estado de cada
pasarela, qué renovar y con qué enlace. **Codex está APAGADO como escritor**
(`STARSEED_CODEX_ESCRITOR=0`): la suscripción de ChatGPT de Alex se agotó cargando con el
100 % de la escritura. La **neurona local** (Ollama en `127.0.0.1:11434`) es la única pasarela
que no puede quedarse sin cupo.

**Escritores de hoy (2026-09-20)**: `google/gemini-3.6-flash` directo (GEMINI_API_KEY; 1M de
contexto, escribe con herramientas), NIM `nemotron-3-super-120b` y `z-ai/glm-5.3`, apinex tras el
fichaje diario, y los gratuitos con herramientas de OpenRouter que el renovador trae del catálogo
cada 30 min (`modelos_extra`, siempre `:free`). Hermes dirige con `gemini-3.6-flash`.

### Jev: decisiones por $0,00002, no texto

`python3 scripts/puente/veredictos.py` juzga las bloqueadas (reglas deterministas primero, Jev en
lo que queda; escribe `olas/veredictos.json` con confianza y fuente). Jev también afina Telegram
(zona de duda), clasifica errores de pasarela desconocidos y puede vetar la aprobación sola.
Consejero con umbral, nunca oráculo. **Techo 0,05 $/día y 1 $/mes**; `python3 scripts/puente/jev.py`
enseña gasto y saldo. Hay 10 $ en OpenRouter: **solo ids `:free`** para agentes y para Hermes.
Regla y detalles: `memory/orquestacion-economica.md` §9.

### Publicar

`python3 scripts/puente/publicar.py "nota"` — rama, commit, las cuatro puertas, push y
verificación cambio a cambio (integrado **y** aplicado). Nunca `git push` a mano. Nunca
`amend`, `rebase` ni `force-push`: la autoría no se toca.

### Al terminar

Toda respuesta a Alex acaba con un informe de uso: qué modelos y APIs se usaron, qué queda, y
qué opciones de enrutamiento hay. Y nunca se le dice que algo está arreglado sin haberlo visto
funcionando en `localhost`.
