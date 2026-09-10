# AGENTS.md · StarSeed OS

Lo lee **Codex** y **Antigravity IDE**. Claude usa `CLAUDE.md`, que manda sobre este archivo
cuando se contradigan; Hermes lee ambos. Los cuatro entornos trabajan sobre el MISMO repo, el
MISMO enjambre y el MISMO Puente de Mando.

## Empieza aquí, siempre

```bash
export PATH="$HOME/.local/bin:$PATH"
starseed-puente estado      # qué hay vivo ahora mismo
cat PUENTE-DE-MANDO.md      # el contexto compartido, regenerado desde el Mando
```

Si `PUENTE-DE-MANDO.md` está viejo o el Mando está apagado:

```bash
bash scripts/puente/arrancar-mando.sh          # levanta localhost:9002
python3 scripts/puente/sincronizar-ides.py     # regenera el contexto y lo reparte
```

## Qué es esto

StarSeed OS es un sistema operativo social descentralizado (Next.js 15 App Router, React 19,
TypeScript estricto, Tailwind/shadcn, Supabase). Se desarrolla en **olas**: tandas de tareas
pequeñas que escriben agentes en paralelo, cada uno en su propio worktree, y que un orquestador
integra en `main` tras pasar escritura → tsc → tests → revisión → aprobación.

El **Puente de Mando** (`localhost:9002/mando`) es el instrumento: enseña qué agentes escriben
ahora, qué tareas esperan aprobación, qué olas hay y en qué estado está el repositorio. Es local
a propósito: `/api/mando/*` devuelve 404 en producción.

## Cómo diriges el enjambre desde aquí

Todas las órdenes van al mismo canal —`starseed_memory_root/olas/control-<cola>.json`— que el
vigilante del orquestador lee cada 20 segundos. Da igual desde qué IDE la escribas.

```bash
starseed-puente agentes                 # quién escribe y desde hace cuánto
starseed-puente aprobar  <id> [...]     # desbloquea la puerta de aprobación humana
starseed-puente rechazar <id> [...]
starseed-puente soltar   <id> [...]     # sácala del orquestador y dásela a un agente tuyo
starseed-puente reasignar <id> <modelo>
starseed-puente puertas                 # tsc · vitest · build · commits sin publicar
```

## Habla en el canal común: es el chat principal de los cuatro

Todo lo que digas —un resultado, un avance, un aviso, una duda, un comentario— va al **mismo
canal**, y de ahí lo lee el chat principal de Claude, Codex, Hermes y Antigravity en vivo. No
hay un hilo por entorno: hay uno. Si algo solo lo sabe tu terminal, para los demás no ha pasado.

```bash
starseed-puente decir "zN4 en verde: 14 tests, salas.ts listo" --de astra --tipo hecho --tarea zN4
starseed-puente decir "xkiro colgado 10 min con 0 bytes, suelto RT1" --de astra --tipo aviso
starseed-puente mensajes 30      # lo último que se ha dicho
starseed-puente escuchar         # seguirlo EN VIVO (esto es el chat principal)
```

Tipos: `mensaje` (por defecto), `aviso`, `hecho`, `error`. Di algo **al empezar una tarea, al
terminarla y cuando algo se tuerza** — no cada dos minutos, y nunca para repetir lo que ya está
en el canal. El avance del enjambre entra solo: `scripts/puente/eco-enjambre.py` vuelca los
eventos del orquestador al mismo sitio.

## Reglas duras

- **Un solo orquestador** (`scripts/enjambre/starseed-enjambre.py`) con N trabajadores. Tres
  procesos a la vez son tres `tsc` simultáneos y tumban la máquina. Los **agentes** sí se
  multiplican: cuantos más en paralelo, mejor, cada uno en su worktree.
- **Nunca `next build` con el enjambre vivo.** La Mac es de 8 GB; un agente `opencode` cuesta
  ~600 MB de runtime Node.
- Tres puertas antes de publicar: `npx tsc --noEmit`, `npx vitest run`, `npx next build` completo.
- **Nada está hecho hasta que se ve en el Mando de la Mac.** «tsc en verde» y «commit integrado»
  son pasos intermedios, no el resultado.
- Cada tarea escribe un **módulo puro NUEVO y pequeño** (≤3 archivos, ≤120 líneas por escritura);
  el cableado va en su propia tarea.
- Tests con `import { describe, it, expect } from "vitest"` — en este repo `globals` está en
  `false`. Prohibido `vi.mock` de módulos de Node y prohibido importar un `route.ts` desde un test.
- Sin `any`. Textos de UI y comentarios en español con acentos. `cursor-pointer` en lo clicable.
- **Claves solo en archivos de entorno** (`~/.hermes/.env`, `~/.starseed/env`). Nunca en el repo,
  ni en documentos, ni en logs, ni en latidos: solo NOMBRES de variable. En `opencode.json`,
  siempre la sintaxis literal `{env:VARIABLE}`.
- Nunca `amend`, `rebase` ni `force-push` para cambiar autoría. `git commit -F archivo`, nunca
  `-m` con comillas invertidas.
- Los `id` de tarea son únicos en todo el histórico **y** entre los archivos de cola vivos: el
  Mando empareja latido y tarea por `cola|id`, y un id duplicado le hace enseñar «0 en curso».
- No uses `pkill -f` ni `pgrep -f` con el nombre del orquestador: la orden se mata a sí misma.
- En macOS no existe `setsid`: `nohup … & disown`, o el doble fork de
  `scripts/puente/arrancar-mando.sh` para algo que deba sobrevivir a la terminal.

## Trampas de entorno que ya costaron un día

1. `npm config get omit` devolvía `dev`: `npm install` borraba en silencio las dependencias de
   desarrollo. Síntomas que no se parecen a la causa: errores de `tsc` por `toHaveAttribute`,
   «Cannot find package 'jsdom'» con jsdom sí declarado, y `next build` muriendo en un ENOENT de
   `node_modules/typescript`. Arreglo: `npm install --include=dev`.
2. Un latido cuyo `bytes` no crece durante minutos con `load` cerca de cero es **una API colgada**,
   no un modelo lento. `escribiendo` no es escribir: se mide con `git status` en el worktree.
3. `llama-server` de BitNet puede quedarse al 99 % de CPU y 1 GB de RAM y dejar la Mac sin memoria
   para el enjambre. Compruébalo antes de culpar al build.

## Dónde está cada cosa

| | |
|---|---|
| Repo | `/Users/alex/Documents/starseed-os-main` |
| Rumbo permanente | `CLAUDE.md` |
| Contexto vivo compartido | `PUENTE-DE-MANDO.md` (se regenera, no lo edites) |
| Estado del enjambre | `starseed_memory_root/olas/` — **no se versiona** |
| Orquestador | `scripts/enjambre/starseed-enjambre.py` → `~/.local/bin/` |
| Puente entre IDE | `scripts/puente/` → `starseed-puente` |
| Publicado | https://starseed-os.vercel.app |
