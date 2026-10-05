# Puente de Mando · contexto compartido de los cuatro entornos

> Generado por `scripts/puente/sincronizar-ides.py` el 2026-10-05 03:38:38 desde el Mando vivo.
> **No lo edites a mano: se regenera.** Lo permanente va en `CLAUDE.md` y en `AGENTS.md`.

Este archivo es el primer mensaje del chat principal en **Claude (Cowork)**, **Codex**,
**Hermes** y **Antigravity IDE**. Los cuatro miran el mismo Mando y dan órdenes por el
mismo canal, así que ninguno necesita que otro le resuma nada.

## Estado ahora mismo

| | |
|---|---|
| Mando | **encendido** en http://127.0.0.1:9002/mando |
| Ola arriba | reintentos-2026-09-22 |
| Agentes escribiendo | **0** |
| En esta ola | integradas 2 · en curso 0 · esperando aprobación 0 · pendientes 0 |
| Últimas 4 olas | en curso 0 · pendientes 0 · integradas 17 |
| HEAD | `bcad172f chore(memoria): aprendizaje de la ola auto-1004-162329` |
| Sin publicar | 72 commits |
| Árbol | limpio |

## Quién escribe ahora (latido de `cola-auto-1004-162329.json`, hace 6s)

| tarea | fase | modelo | lleva | quieto | bytes |
|---|---|---|---|---|---|
| `DIS1005Mc` | hecho | - | 8 min | 487 s | 15761 |
| `BLQ1005Ac` | hecho | openrouter/google/gemma-4-31b-it:f | 24 min | 1411 s | 13131 |
| `PRD1005Tbs` | hecho | nvidia/moonshotai/kimi-k3 | 40 min | 2425 s | 96370 |
| `FLU1005C` | hecho | openrouter/google/gemma-4-31b-it:f | 55 min | 3302 s | 2787 |
| `CAMR1005E` | hecho | nvidia/moonshotai/kimi-k3 | 68 min | 4075 s | 108624 |
| `DIS1005Dc` | hecho | nvidia/moonshotai/kimi-k3 | 86 min | 5189 s | 87590 |
| `PRD1005F` | hecho | openrouter/google/gemma-4-31b-it:f | 87 min | 5249 s | 2670 |
| `BLQ1005Ab` | hecho | codex/gpt-5.6-sol | 93 min | 5583 s | 3840445 |
| `SP092922c` | hecho | codex/gpt-5.6-sol | 104 min | 6265 s | 449474 |
| `PRD1005Q` | hecho | nvidia/z-ai/glm-5.3 | 112 min | 6691 s | 29511 |
| `OPT1004E` | hecho | nvidia/z-ai/glm-5.3 | 119 min | 7133 s | 3174 |
| `PRD1005Tb` | hecho | nvidia/moonshotai/kimi-k3 | 122 min | 7316 s | 84621 |
| `LC1004Bc` | hecho | openrouter/google/gemma-4-31b-it:f | 123 min | 7408 s | 18640 |
| `PRD1005Db` | hecho | nvidia/moonshotai/kimi-k3 | 132 min | 7921 s | 96734 |
| `DIS1005Mb` | hecho | openrouter/google/gemma-4-31b-it:f | 154 min | 9248 s | 2021 |
| `DIS1005Db` | hecho | openrouter/google/gemma-4-31b-it:f | 159 min | 9515 s | 3392 |
| `PA1005Ab` | hecho | openrouter/google/gemma-4-31b-it:f | 159 min | 9554 s | 15611 |
| `PA1005Cb` | hecho | nvidia/moonshotai/kimi-k3 | 186 min | 11140 s | 72232 |
| `BLQ1005A` | hecho | openrouter/google/gemma-4-31b-it:f | 190 min | 11414 s | 48739 |
| `CAMR1005A` | hecho | openrouter/google/gemma-4-31b-it:f | 192 min | 11519 s | 12577 |
| `PRD1005L` | hecho | openrouter/google/gemma-4-31b-it:f | 196 min | 11749 s | 6816 |
| `FLU1005A` | hecho | codex/gpt-5.6-sol | 223 min | 13402 s | 722446 |
| `PRD1005P` | hecho | nvidia/moonshotai/kimi-k3 | 224 min | 13417 s | 101278 |
| `PRD1005M` | hecho | nvidia/moonshotai/kimi-k3 | 234 min | 14025 s | 113597 |
| `PRD1005O` | hecho | nvidia/moonshotai/kimi-k3 | 241 min | 14449 s | 99799 |
| `PRD1005N` | hecho | nvidia/z-ai/glm-5.3 | 244 min | 14629 s | 17484 |
| `DIS1005M` | hecho | openrouter/thinkingmachines/inklin | 257 min | 15390 s | 130069 |
| `DIS1005H` | hecho | openrouter/thinkingmachines/inklin | 258 min | 15507 s | 183582 |
| `PRD1005D` | hecho | apinex/free/deepseek-v4-pro-0813 | 262 min | 15698 s | 32117 |
| `DIS1005F` | hecho | nvidia/moonshotai/kimi-k3 | 281 min | 16889 s | 85892 |
| `PRD1005G` | hecho | nvidia/moonshotai/kimi-k3 | 296 min | 17746 s | 64022 |
| `DIS1005G` | hecho | nvidia/moonshotai/kimi-k3 | 296 min | 17766 s | 104415 |
| `LC1004Ac` | hecho | codex/gpt-5.6-sol | 303 min | 18168 s | 511739 |
| `DIS1005C` | hecho | openrouter/thinkingmachines/inklin | 307 min | 18395 s | 93356 |
| `DIS1005I` | hecho | nvidia/moonshotai/kimi-k3 | 316 min | 18937 s | 140265 |
| `DIS1005D` | hecho | openrouter/thinkingmachines/inklin | 321 min | 19276 s | 131373 |
| `PRD1005T` | hecho | xkiro/qwen/qwen3.8-max:free | 330 min | 19773 s | 85333 |
| `PRD1005A` | hecho | nvidia/moonshotai/kimi-k3 | 337 min | 20222 s | 146474 |
| `PRD1005B` | hecho | nvidia/moonshotai/kimi-k3 | 347 min | 20839 s | 112678 |
| `PRD1005C` | hecho | openrouter/thinkingmachines/inklin | 353 min | 21176 s | 141121 |
| `PA1005A` | hecho | openrouter/thinkingmachines/inklin | 366 min | 21988 s | 325484 |
| `PRD1005E` | hecho | nvidia/moonshotai/kimi-k3 | 374 min | 22420 s | 105729 |
| `DIS1005J` | hecho | nvidia/moonshotai/kimi-k3 | 385 min | 23097 s | 105146 |
| `DIS1005B` | hecho | nvidia/moonshotai/kimi-k3 | 407 min | 24430 s | 86592 |
| `DIS1005A` | hecho | codex/gpt-5.6-sol | 412 min | 24707 s | 2174199 |
| `CDV1004Cs` | hecho | openrouter/thinkingmachines/inklin | 443 min | 26567 s | 151470 |
| `PA1005B` | hecho | nvidia/moonshotai/kimi-k3 | 444 min | 26612 s | 92006 |
| `PA1005C` | hecho | xkiro/mistralai/devstral-medium | 447 min | 26813 s | 141432 |
| `NUB1004A` | hecho | nvidia/moonshotai/kimi-k3 | 472 min | 28307 s | 149628 |
| `CDV1004C` | hecho | codex/gpt-5.6-sol | 488 min | 29256 s | 279854 |
| `OPT1004D` | hecho | openrouter/thinkingmachines/inklin | 500 min | 29993 s | 151585 |
| `OPT1004F` | hecho | codex/gpt-5.6-sol | 502 min | 30123 s | 814551 |
| `OPT1004C` | hecho | nvidia/moonshotai/kimi-k3 | 522 min | 31337 s | 73367 |
| `LC1004A` | hecho | openrouter/thinkingmachines/inklin | 523 min | 31397 s | 177304 |
| `OPT1004H` | hecho | nvidia/moonshotai/kimi-k3 | 549 min | 32934 s | 104212 |
| `OPT1004G` | hecho | openrouter/thinkingmachines/inklin | 549 min | 32937 s | 117528 |
| `OPT1004I` | hecho | openrouter/thinkingmachines/inklin | 553 min | 33202 s | 132674 |
| `OPT1004A` | hecho | nvidia/moonshotai/kimi-k3 | 574 min | 34416 s | 182214 |
| `SB1004B` | hecho | openrouter/thinkingmachines/inklin | 578 min | 34685 s | 99910 |
| `HG1004H` | hecho | openrouter/thinkingmachines/inklin | 589 min | 35352 s | 108651 |
| `OPT1004B` | hecho | openrouter/thinkingmachines/inklin | 604 min | 36211 s | 86716 |
| `TPS1004A` | hecho | openrouter/thinkingmachines/inklin | 605 min | 36292 s | 56013 |
| `CDV1004A` | hecho | openrouter/thinkingmachines/inklin | 606 min | 36333 s | 142592 |
| `CDV1004B` | hecho | openrouter/thinkingmachines/inklin | 636 min | 38173 s | 127573 |
| `SB1004A` | hecho | nvidia/z-ai/glm-5.3 | 656 min | 39347 s | 11386 |
| `LC1004B` | hecho | openrouter/thinkingmachines/inklin | 661 min | 39666 s | 101878 |

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
