# Puente de Mando · contexto compartido de los cuatro entornos

> Generado por `scripts/puente/sincronizar-ides.py` el 2026-09-17 15:36:53 desde el Mando vivo.
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
| En esta ola | integradas 2 · en curso 0 · esperando aprobación 0 · pendientes 0 |
| Últimas 4 olas | en curso 0 · pendientes 0 · integradas 2 |
| HEAD | `970a886b chore(memoria): aprendizaje de la ola auto-0917-143956` |
| Sin publicar | 7 commits |
| Árbol | limpio |

## Quién escribe ahora (latido de `cola-auto-0917-143956.json`, hace 4s)

| tarea | fase | modelo | lleva | quieto | bytes |
|---|---|---|---|---|---|
| `RS1p` | hecho | groq/qwen/qwen3.8-27b | 0 min | 24 s | 52309 |
| `RS3b` | hecho | codex/gpt-5.6-sol | 1 min | 54 s | 47530 |
| `CU3b` | hecho | codex/gpt-5.6-sol | 24 min | 1451 s | 82231 |
| `NE1b` | hecho | codex/gpt-5.6-sol | 26 min | 1530 s | 69441 |
| `DR0917-2` | hecho | codex/gpt-5.6-sol | 32 min | 1902 s | 31375 |
| `DR0917-1` | hecho | groq/openai/gpt-oss-120b | 41 min | 2442 s | 36410 |

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

### Publicar

`python3 scripts/puente/publicar.py "nota"` — rama, commit, las cuatro puertas, push y
verificación cambio a cambio (integrado **y** aplicado). Nunca `git push` a mano. Nunca
`amend`, `rebase` ni `force-push`: la autoría no se toca.

### Al terminar

Toda respuesta a Alex acaba con un informe de uso: qué modelos y APIs se usaron, qué queda, y
qué opciones de enrutamiento hay. Y nunca se le dice que algo está arreglado sin haberlo visto
funcionando en `localhost`.
