# Genesis · contexto compartido de los cuatro entornos

> Generado por `scripts/puente/sincronizar-ides.py` el 2026-11-06 04:26:13 desde Genesis vivo.
> **No lo edites a mano: se regenera.** Lo permanente va en `CLAUDE.md` y en `AGENTS.md`.

Este archivo es el primer mensaje del chat principal en **Claude (Cowork)**, **Codex**,
**Hermes** y **Antigravity IDE**. Los cuatro miran el mismo Genesis y dan órdenes por el
mismo canal, así que ninguno necesita que otro le resuma nada.

## Estado ahora mismo

| | |
|---|---|
| Genesis | **encendido** en http://127.0.0.1:9002/mando |
| Ola arriba | Sueños profundos 2026-10-24 |
| Agentes escribiendo | **0** |
| En esta ola | integradas 0 · en curso 0 · esperando aprobación 0 · pendientes 41 |
| Últimas 4 olas | en curso 0 · pendientes 80 · integradas 0 |
| HEAD | `88d2f224c4 chore(memoria): aprendizaje de la ola auto-1105-221934` |
| Sin publicar | 12 commits |
| Árbol | 1 archivos sin commitear |

## Quién escribe ahora (latido de `cola-auto-1105-221934.json`, hace 29s)

| tarea | fase | modelo | lleva | quieto | bytes |
|---|---|---|---|---|---|
| `LNN1028I2-d3` | hecho | freellmapi/auto | 1 min | 73 s | 99424 |
| `IMG-agentes-reimaginada-profunda-sustituir-lbsb-d2` | hecho | freellmapi/auto | 10 min | 597 s | 759125 |
| `RPO1104C` | hecho | freellmapi/auto | 27 min | 1614 s | 63264 |
| `LNN1028I2-d2` | hecho | freellmapi/auto | 42 min | 2547 s | 103072 |
| `LNN1028I2-d1b` | hecho | freellmapi/auto | 91 min | 5465 s | 92276 |
| `WT1011Bb-d3` | hecho | freellmapi/auto | 92 min | 5495 s | 539842 |
| `DR1029-1` | hecho | freellmapi/auto | 119 min | 7160 s | 27994 |
| `IMG-agentes-reimaginada-diaria-tapar-las-dos` | hecho | freellmapi/auto | 137 min | 8243 s | 65725 |
| `LNN1028I2-d1` | hecho | freellmapi/auto | 138 min | 8259 s | 329682 |
| `RPO1104M-d2` | hecho | freellmapi/auto | 146 min | 8762 s | 67595 |
| `MBR1105A` | hecho | freellmapi/auto | 165 min | 9891 s | 66696 |
| `DSV1105C` | hecho | freellmapi/auto | 184 min | 11063 s | 60612 |
| `SUP0611B` | hecho | freellmapi/auto | 185 min | 11099 s | 154142 |
| `VER1105Db-d3` | hecho | freellmapi/auto | 226 min | 13581 s | 85630 |
| `RPO1104S-d2` | hecho | freellmapi/auto | 257 min | 15445 s | 2891 |
| `IMG-agentes-reimaginada-profunda-sustituir-lbsb` | hecho | freellmapi/auto | 276 min | 16577 s | 320654 |
| `WT1011Bb-d2` | hecho | nvidia/nvidia/nemotron-3-ultra-550 | 287 min | 17217 s | 184749 |
| `VER1105Gd` | hecho | nvidia/nvidia/nemotron-3-ultra-550 | 305 min | 18320 s | 96626 |
| `WT1011Bb-d1` | hecho | nvidia/nvidia/nemotron-3-ultra-550 | 321 min | 19263 s | 129974 |
| `RPO1104B-d2` | hecho | nvidia/minimaxai/minimax-m3.1-flas | 336 min | 20181 s | 32573 |
| `RPO1104Q-d2` | hecho | freellmapi/auto | 339 min | 20366 s | 69509 |
| `DPT1105Ab` | hecho | nvidia/nvidia/nemotron-3-super-120 | 365 min | 21883 s | 354434 |
| `TRD1020Db-d3b` | hecho |  | 366 min | 21968 s | 258525 |

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
- **Genesis se compila fuera: nadie lanza `next build` ni `next dev` a mano.**
  Ni en la Mac ni en el 9002, ni servidores propios en otro puerto. Si Genesis
  no abre, mira `/tmp/starseed-reconstruir.log` y el estado con el MCP
  `starseed-director`, y pide `reconstruir_mando.py --una-vez --ya` o la
  compilación en el A1.
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
