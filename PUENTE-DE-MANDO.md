# Puente de Mando · contexto compartido de los cuatro entornos

> Generado por `scripts/puente/sincronizar-ides.py` el 2026-09-21 05:14:05 desde el Mando vivo.
> **No lo edites a mano: se regenera.** Lo permanente va en `CLAUDE.md` y en `AGENTS.md`.

Este archivo es el primer mensaje del chat principal en **Claude (Cowork)**, **Codex**,
**Hermes** y **Antigravity IDE**. Los cuatro miran el mismo Mando y dan órdenes por el
mismo canal, así que ninguno necesita que otro le resuma nada.

## Estado ahora mismo

| | |
|---|---|
| Mando | **encendido** en http://127.0.0.1:9002/mando |
| Ola arriba | Ola Dream 2026-09-15 · lo que el análisis nocturno encontró |
| Agentes escribiendo | **0** |
| En esta ola | integradas 1 · en curso 0 · esperando aprobación 0 · pendientes 0 |
| Últimas 4 olas | en curso 0 · pendientes 0 · integradas 14 |
| HEAD | `49cac336 chore(memoria): aprendizaje de la ola auto-0920-182930` |
| Sin publicar | 48 commits |
| Árbol | limpio |

## Quién escribe ahora (latido de `cola-auto-0920-182930.json`, hace 5s)

| tarea | fase | modelo | lleva | quieto | bytes |
|---|---|---|---|---|---|
| `RN8` | hecho | codex/gpt-5.6-sol | 3 min | 167 s | 449212 |
| `RN7` | hecho | google/gemini-3.6-flash | 10 min | 575 s | 69147 |
| `RN6` | hecho | codex/gpt-5.6-sol | 34 min | 2022 s | 451517 |
| `RN5` | hecho | nvidia/moonshotai/kimi-k3 | 53 min | 3169 s | 42913 |
| `RN3` | hecho | codex/gpt-5.6-sol | 85 min | 5101 s | 634895 |
| `RN4` | hecho | google/gemini-3.6-flash | 92 min | 5502 s | 40729 |
| `RN2` | hecho | google/gemini-3.6-flash | 95 min | 5729 s | 66792 |
| `CU3r` | hecho | google/gemini-3.6-flash | 101 min | 6083 s | 114624 |
| `JV12c` | hecho | codex/gpt-5.6-sol | 103 min | 6151 s | 462271 |
| `RN1` | hecho | google/gemini-3.6-flash | 104 min | 6223 s | 49454 |
| `CU3c` | hecho | nvidia/moonshotai/kimi-k3 | 117 min | 7039 s | 176352 |
| `JV7c` | hecho | openrouter/thinkingmachines/inklin | 118 min | 7105 s | 26355 |
| `JV8c` | hecho | openrouter/thinkingmachines/inklin | 123 min | 7352 s | 28225 |
| `AGR2b` | hecho | google/gemini-3.6-flash | 126 min | 7546 s | 36188 |
| `DR0917-2b` | hecho | openrouter/thinkingmachines/inklin | 135 min | 8082 s | 111114 |
| `AS2c` | hecho | codex/gpt-5.6-sol | 143 min | 8577 s | 1125350 |
| `p323Bb` | hecho | nvidia/moonshotai/kimi-k3 | 149 min | 8936 s | 91730 |
| `p324Gb` | hecho | codex/gpt-5.6-sol | 164 min | 9855 s | 306408 |
| `p324Ab` | hecho | google/gemini-3.6-flash | 174 min | 10414 s | 32956 |
| `p324Fb` | hecho | google/gemini-3.6-flash | 178 min | 10656 s | 19129 |
| `JV8` | hecho | codex/gpt-5.6-sol | 184 min | 11018 s | 493491 |
| `p323Gb` | hecho | google/gemini-3.6-flash | 185 min | 11079 s | 46083 |
| `p320Fb` | hecho | google/gemini-3.6-flash | 189 min | 11318 s | 110799 |
| `p321Jb` | hecho | google/gemini-3.6-flash | 196 min | 11763 s | 549579 |
| `p321Bb` | hecho | nvidia/moonshotai/kimi-k3 | 211 min | 12683 s | 79727 |
| `p320Bb` | hecho | nvidia/moonshotai/kimi-k3 | 225 min | 13527 s | 50871 |
| `p316Mb` | hecho | google/gemini-3.6-flash | 261 min | 15655 s | 60487 |
| `p316Jb` | hecho | codex/gpt-5.6-sol | 261 min | 15677 s | 699171 |
| `p316Ib` | hecho | codex/gpt-5.6-sol | 289 min | 17368 s | 716154 |
| `p316Fb` | hecho | nvidia/moonshotai/kimi-k3 | 302 min | 18101 s | 52017 |
| `p316Gb` | hecho | google/gemini-3.6-flash | 305 min | 18311 s | 115242 |
| `R7b` | hecho | openrouter/thinkingmachines/inklin | 319 min | 19113 s | 110579 |
| `QW5b` | hecho | google/gemini-3.6-flash | 323 min | 19357 s | 56154 |
| `X5c` | hecho | openrouter/thinkingmachines/inklin | 355 min | 21274 s | 31751 |
| `R6b` | hecho | openrouter/nvidia/nemotron-3-ultra | 367 min | 22019 s | 66132 |
| `NE1c` | hecho | openrouter/poolside/laguna-xs-2.1: | 388 min | 23272 s | 86059 |
| `AS2b` | hecho | google/gemini-3.6-flash | 447 min | 26824 s | 90179 |
| `JV7b` | hecho | openrouter/thinkingmachines/inklin | 449 min | 26948 s | 242293 |
| `JV12b` | hecho | nvidia/moonshotai/kimi-k3 | 471 min | 28251 s | 65899 |
| `JV8b` | hecho | openrouter/thinkingmachines/inklin | 505 min | 30300 s | 205491 |
| `NE2` | hecho | nvidia/moonshotai/kimi-k3 | 526 min | 31573 s | 38643 |
| `AX2` | hecho | openrouter/dots-studio/dots-3-note | 530 min | 31821 s | 34841 |
| `AX1` | hecho | openrouter/nvidia/nemotron-3-ultra | 541 min | 32478 s | 77348 |
| `JV7` | hecho | openrouter/thinkingmachines/inklin | 561 min | 33661 s | 74055 |
| `JV12` | hecho | openrouter/thinkingmachines/inklin | 561 min | 33662 s | 59600 |
| `AS2` | hecho | codex/gpt-5.6-sol | 561 min | 33664 s | 4494073 |
| `JV11` | hecho | openrouter/thinkingmachines/inklin | 598 min | 35870 s | 71604 |
| `DV2` | hecho | codex/gpt-5.6-sol | 609 min | 36557 s | 639856 |
| `JV6` | hecho | openrouter/nex-agi/nex-n2.5-pro:fr | 613 min | 36769 s | 62781 |

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
- **Nada está hecho hasta que se ve en el Mando de la Mac.**
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
| Mando | `http://127.0.0.1:9002/mando` — local, `/api/mando/*` devuelve 404 en producción |
| Publicado | https://starseed-os.vercel.app |

## Cómo se trabaja aquí

Esto es el MÉTODO, no el estado. Vale igual en Claude, Hermes, Codex, Cursor, VS Code o
Antigravity: quien abra un chat sobre este repo trabaja así. Lo escribe el Puente de Mando y
se regenera solo — no lo edites a mano; el original es `memory/workflow-actual.md`.

### Quién escribe qué

El **enjambre escribe el código de producto**. Los asistentes (Claude, Hermes, Codex…)
dirigen, verifican y publican: diseñan olas, las lanzan, miran el Mando, comprueban en
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
