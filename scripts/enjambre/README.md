# scripts/enjambre · orquestador multiagéntico versionado (Ola 259, 2026-09-06)

Aquí vive, **versionado en el repo**, el motor que ejecuta las olas del enjambre:

- **`starseed-enjambre.py`** — orquestador paralelo (Python 3 puro, ~1750 líneas, N trabajadores
  en `git worktree` propios, puertas por tarea: tsc → reparación → vitest → revisión cruzada por
  otro proveedor → commit → integración ff en main). Escritores: opencode con xKiro/NIM gratis;
  revisores: OpenRouter/NIM/Gemini. Gratis primero, relevo ante 429/402.
- **`lanzador.py`** — vigilante de la nube: recoge órdenes firmadas (HMAC) del bus y arranca colas
  en el contenedor. Solo se instala en Linux.
- **`instalar.sh`** — instala (repo → máquina), `--comprobar` (compara md5, sale 1 si difieren e
  indica cuál es más nueva por mtime) y `--traer` (máquina → repo, para versionar cambios en
  caliente). Sin sudo; copia con `cp -p`, nunca enlaces (se ejecuta con `setsid -f` desde rutas
  fijas).

Destinos: Mac → `~/.local/bin/starseed-enjambre.py` · Linux → `~/bin/starseed-enjambre.py` +
`~/starseed-vigia/lanzador.py`. Deben ser **byte a byte** iguales a lo que hay aquí (el test que
verifica md5 vive en la raíz del repo).

## Lanzar una cola

```bash
export STARSEED_MEDIO=claude
setsid -f python3 -u ~/.local/bin/starseed-enjambre.py \
  starseed_memory_root/olas/cola-<n>.json --workers 2 \
  > /tmp/ola-<n>.log 2>&1 < /dev/null
```

Estado y trazas: `starseed_memory_root/olas/{progreso.json,progreso.md,eventos.jsonl,logs/<id>.log}`.

## Variables de entorno

- `STARSEED_ROOT` — raíz del repo (si no, la adivina: Mac `~/Documents/starseed-os-main`, nube
  `~/starseed-system`).
- `STARSEED_WT` — carpeta base de los worktrees.
- `STARSEED_MEDIO` — quién lanza (`claude`, `hermes`, `mando`, `cron`…); viaja en los eventos.
- `STARSEED_APROBACION=1` — nodo humano: integra solo tras tu visto bueno (rama `ola/<id>` lista).

## Puertas según el tipo de repo

Si la raíz **no** tiene `tsconfig.json`, el orquestador lo trata como repo Python: compila con
`python3 -m py_compile` y corre `pytest` en vez de tsc/vitest (ver `repo_es_python`).

## Límites

En la nube el techo es **2 trabajadores** (`--workers 2`): más saturan el contenedor.

## Claves

**Nunca en el repo ni en memorias** (solo nombres de variable). Viven en `~/.starseed/env`
(chmod 600) y `~/.hermes/.env`.

## Regla de Alex

Todo lo ejecuta el enjambre; Claude **diseña, supervisa y verifica** — no edita a mano lo que una
ola puede escribir.
