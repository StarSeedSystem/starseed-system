# Puente de Mando · contexto compartido de los cuatro entornos

> Generado por `scripts/puente/sincronizar-ides.py` el 2026-10-05 11:56:24 desde el Mando vivo.
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
| HEAD | `22630d16 chore(memoria): aprendizaje de la ola auto-1005-045033` |
| Sin publicar | 38 commits |
| Árbol | limpio |

## Quién escribe ahora (latido de `cola-auto-1005-045033.json`, hace 4s)

| tarea | fase | modelo | lleva | quieto | bytes |
|---|---|---|---|---|---|
| `DIS1005E` | hecho | nvidia/moonshotai/kimi-k3 | 1 min | 34 s | 178902 |
| `BLQ1005C` | hecho | - | 11 min | 675 s | 5387 |
| `BLQ1005B` | hecho | - | 30 min | 1819 s | 2988 |
| `BLQ1005E` | hecho | nvidia/moonshotai/kimi-k3 | 46 min | 2768 s | 113 |
| `BLQ1005D` | hecho | nvidia/moonshotai/kimi-k3 | 46 min | 2788 s | 127711 |
| `PA1005D` | hecho | - | 62 min | 3724 s | 52320 |
| `PRD1005I` | hecho | nvidia/moonshotai/kimi-k3 | 64 min | 3826 s | 112675 |
| `FLU1005H` | hecho | nvidia/moonshotai/kimi-k3 | 86 min | 5188 s | 113 |
| `p316Mc` | hecho | openrouter/cohere/north-mini-code: | 87 min | 5217 s | 362047 |
| `p316Mb` | hecho | google/gemini-3.6-flash | 97 min | 5803 s | 231606 |
| `PRD1005Tbs` | hecho | nvidia/moonshotai/kimi-k3 | 107 min | 6436 s | 177688 |
| `p316Ic` | hecho | codex/gpt-5.6-sol | 109 min | 6565 s | 2243435 |
| `p316Gc` | hecho | google/gemini-3.6-flash | 111 min | 6660 s | 297949 |
| `DIS1005L` | hecho | nvidia/moonshotai/kimi-k3 | 120 min | 7200 s | 148328 |
| `TK2c` | hecho | google/gemini-3.6-flash | 133 min | 7994 s | 1273424 |
| `R6c` | hecho | openrouter/thinkingmachines/inklin | 137 min | 8223 s | 273542 |
| `R6b` | hecho | openrouter/nvidia/nemotron-3-ultra | 138 min | 8283 s | 237911 |
| `R7c` | hecho | nvidia/deepseek-ai/deepseek-v4-pro | 140 min | 8426 s | 318562 |
| `R7b` | hecho | openrouter/thinkingmachines/inklin | 143 min | 8553 s | 282296 |
| `DIS1005M` | hecho | - | 156 min | 9330 s | 130361 |
| `JV8c` | hecho | openrouter/thinkingmachines/inklin | 165 min | 9919 s | 207862 |
| `DR1003-1` | hecho | nvidia/moonshotai/kimi-k3 | 170 min | 10176 s | 621 |
| `DR0929-1` | hecho | nvidia/moonshotai/kimi-k3 | 171 min | 10263 s | 4160 |
| `DR0927-2` | hecho | nvidia/moonshotai/kimi-k3 | 174 min | 10411 s | 2809 |
| `DR0927-1` | hecho | nvidia/moonshotai/kimi-k3 | 174 min | 10444 s | 327 |
| `DR0919-1` | hecho | nvidia/moonshotai/kimi-k3 | 174 min | 10460 s | 96883 |
| `p314Acs` | hecho | nvidia/moonshotai/kimi-k3 | 175 min | 10521 s | 7945 |
| `p318Jc` | hecho | nvidia/moonshotai/kimi-k3 | 176 min | 10583 s | 453067 |
| `p324Gc` | hecho | openrouter/dots-studio/dots-3-note | 179 min | 10711 s | 244064 |
| `DIS1005P` | hecho | nvidia/moonshotai/kimi-k3 | 190 min | 11380 s | 32757 |
| `p324Ac` | hecho | nvidia/moonshotai/kimi-k3 | 205 min | 12325 s | 681373 |
| `AGR2b` | hecho | google/gemini-3.6-flash | 206 min | 12355 s | 216704 |
| `X5c` | hecho | nvidia/moonshotai/kimi-k3 | 208 min | 12477 s | 226606 |
| `p323Bc` | hecho | codex/gpt-5.6-sol | 209 min | 12527 s | 643962 |
| `QW5c` | hecho | google/gemini-3.6-flash | 216 min | 12957 s | 253130 |
| `CU3r` | hecho | google/gemini-3.6-flash | 219 min | 13152 s | 295607 |
| `AGR2c` | hecho | google/gemini-3.6-flash | 226 min | 13551 s | 1732795 |
| `PA1005A` | hecho | openrouter/thinkingmachines/inklin | 231 min | 13842 s | 430524 |
| `RM3` | hecho | google/gemini-3.6-flash | 232 min | 13908 s | 1665178 |
| `PRD1005S` | hecho | nvidia/moonshotai/kimi-k3 | 240 min | 14412 s | 113 |
| `DIS1005D` | hecho | nvidia/moonshotai/kimi-k3 | 241 min | 14436 s | 233203 |
| `RM4` | hecho | google/gemini-3.6-flash | 244 min | 14650 s | 1477659 |
| `FLU1005B` | hecho | nvidia/moonshotai/kimi-k3 | 249 min | 14922 s | 113 |
| `PRD1005M` | hecho | nvidia/moonshotai/kimi-k3 | 249 min | 14941 s | 204568 |
| `PRD1005L` | hecho | nvidia/moonshotai/kimi-k3 | 252 min | 15100 s | 153397 |
| `LC1004A` | hecho | codex/gpt-5.6-sol | 254 min | 15224 s | 801626 |
| `BLQ1005Ad` | hecho | codex/gpt-5.6-sol | 280 min | 16799 s | 4164239 |
| `OPT1004E` | hecho | nvidia/moonshotai/kimi-k3 | 288 min | 17270 s | 211351 |
| `SB1004A` | hecho | nvidia/moonshotai/kimi-k3 | 289 min | 17352 s | 135239 |
| `PA1005C` | hecho | nvidia/moonshotai/kimi-k3 | 300 min | 17971 s | 266472 |
| `LC1004Bc` | hecho | nvidia/moonshotai/kimi-k3 | 320 min | 19170 s | 142721 |
| `PRD1005Q` | hecho | nvidia/moonshotai/kimi-k3 | 320 min | 19220 s | 187721 |
| `FLU1005C` | hecho | nvidia/moonshotai/kimi-k3 | 323 min | 19376 s | 142072 |
| `CDV1004Cs` | hecho | nvidia/moonshotai/kimi-k3 | 346 min | 20783 s | 274921 |
| `PRD1005F` | hecho | nvidia/moonshotai/kimi-k3 | 356 min | 21375 s | 153916 |
| `LC1004B` | hecho | codex/gpt-5.6-sol | 362 min | 21727 s | 208261 |
| `PRD1005N` | hecho | nvidia/moonshotai/kimi-k3 | 374 min | 22444 s | 17718 |
| `PRD1005D` | hecho | nvidia/moonshotai/kimi-k3 | 375 min | 22479 s | 167804 |
| `CAMR1005A` | hecho | nvidia/moonshotai/kimi-k3 | 398 min | 23892 s | 140556 |
| `PRD1005T` | hecho | nvidia/moonshotai/kimi-k3 | 400 min | 24011 s | 209690 |
| `BLQ1005A` | hecho | nvidia/moonshotai/kimi-k3 | 410 min | 24629 s | 85928 |
| `BLQ1005Ac` | hecho | nvidia/moonshotai/kimi-k3 | 425 min | 25520 s | 13244 |

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
