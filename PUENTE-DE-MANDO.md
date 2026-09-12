# Puente de Mando · contexto compartido de los cuatro entornos

> Generado por `scripts/puente/sincronizar-ides.py` el 2026-09-12 14:10:34 desde el Mando vivo.
> **No lo edites a mano: se regenera.** Lo permanente va en `CLAUDE.md` y en `AGENTS.md`.

Este archivo es el primer mensaje del chat principal en **Claude (Cowork)**, **Codex**,
**Hermes** y **Antigravity IDE**. Los cuatro miran el mismo Mando y dan órdenes por el
mismo canal, así que ninguno necesita que otro le resuma nada.

## Estado ahora mismo

| | |
|---|---|
| Mando | **encendido** en http://127.0.0.1:9002/mando |
| Ola arriba | Ola 316 · Salud del Puente: agentes que vigilan cada medidor |
| Agentes escribiendo | **5** |
| En esta ola | integradas 0 · en curso 1 · esperando aprobación 0 · pendientes 5 |
| Últimas 7 olas | en curso 5 · pendientes 5 · integradas 10 |
| HEAD | `b0e46839 Puente · el Mando vuelve a 9002 con next start sobre el build compilado` |
| Sin publicar | 0 commits |
| Árbol | limpio |

## Quién escribe ahora (latido de `cola-auto-0912-141019.json`, hace 0s)

| tarea | fase | modelo | lleva | quieto | bytes |
|---|---|---|---|---|---|
| `p316A` | escribiendo | nvidia/moonshotai/kimi-k3 | 0 min | 9 s | 234 |
| `zAR3` | escribiendo | xkiro/qwen/qwen3-coder-plus:free | 0 min | 10 s | 323 |
| `LT3` | escribiendo | xkiro/qwen/qwen3-coder-plus:free | 0 min | 10 s | 767 |
| `MD7` | escribiendo | nvidia/deepseek-ai/deepseek-v4-pro | 0 min | 10 s | 4485 |
| `MD3` | escribiendo | nvidia/moonshotai/kimi-k3 | 0 min | 10 s | 464 |

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

