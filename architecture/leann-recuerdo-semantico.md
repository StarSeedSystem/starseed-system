# LEANN · el recuerdo semántico de Astraura, fusionado con las demás capas (LNN1028)

**Pedido de Alex (2026-10-28):** «agrega también este para todo lo de Astraura multicapas con los demás sistemas, todos
deben ser fusionados, recuerda» — https://github.com/StarTrail-org/LEANN (y en la Biblioteca autoactualizable).
Mapa de cómo se funde todo: `architecture/astraura-multicapas-fusion.md`.

## 1. Qué es LEANN (medido el 2026-10-28)

- **«El índice vectorial más pequeño del mundo»** (StarTrail-org, antes yichuan-w/LEANN; **MIT**, «LEANN Contributors»).
  - En vez de guardar todos los vectores, guarda un **grafo podado** y **recalcula** los vectores de los pocos nodos que
    visita cada búsqueda. Su ejemplo: 60 millones de fragmentos en 6 GB en lugar de 201 GB, ~97 % menos disco, con la
    misma calidad.
  - Su README dice «zero telemetry».
- **Versiones:** etiqueta `v0.3.8` (commit del 2026-09-26; PyPI `leann` 0.3.8 del 2026-09-28; 31 etiquetas). `v0.3.9` se
  preparó el 2026-10-27 pero su etiqueta aún no está publicada.
  - Python ≥ 3.10.
  - Ruedas del backend HNSW para macOS arm64 (14, 15 y 26), Linux aarch64 y x86_64 y Windows.
- **Lo que trae:**
  - Backends `hnsw` (por defecto) y `diskann`.
  - **BM25 propio** (SQLite FTS5) y mezcla con el vectorial (`vector_weight`).
  - Filtros por metadatos (`==`, `in`, `not_in`, `contains`, `>=`…).
  - Actualización incremental (`update_index`, `leann watch`).
  - Troceado de código por AST.
  - CLI (`leann build/search/ask/list/remove`), servidor HTTP propio (FastAPI, `127.0.0.1:8000` por defecto, **sin
    autenticación**) y servidor MCP (`leann_mcp`, para Claude Code).
- **Incrustaciones** (`--embedding-mode`): `sentence-transformers`, `openai` (cualquier extremo compatible), `mlx` u
  `ollama`.
- **Lo que pesa:** `leann-core` arrastra `torch`, `sentence-transformers` y `llama-index` aunque se use Ollama
  (≈ 1,5–2 GB en un entorno). **En la Mac no cabe** (hoy 2,6 GB libres). **En el A1 sí:**
  - medido el 2026-10-28: 16 GB de disco libres, ~5 GB de RAM disponible en ese momento y Python 3.12.3;
  - Ollama ya instalado y **apagado** a propósito («hazlo solo si mejora u optimiza los procesos», 2026-10-19);
    LEANN es el primer uso de verdad que lo justifica.
- **Para un agente que programa** (su prueba con Claude Code en 30 tareas de SWE-Bench Pro): 2,1× más código relevante
  encontrado al empezar y un 8,4 % menos de tokens que con BM25.

## 2. Su papel en la fusión

| Capa o sistema | Qué aporta LEANN |
|---|---|
| **Capa memoria** (recordar antes de responder) | búsqueda **por significado** en las cápsulas Memvid y en los archivos de memoria de los cerebros. Memvid guarda la historia (solo añadir, línea del tiempo, cifrado); LEANN encuentra lo parecido aunque no compartan palabras |
| **Alcance** (`src/lib/nucleo/alcance-memoria.ts`) | **un índice por sujeto y alcance**, igual que las cápsulas, y además `alcance` y `sujeto` como metadatos que filtran cada búsqueda; un índice colectivo nunca contiene nada personal |
| **Juicio** (Jev · Laya · Colibri) | antes de buscar, `decidir.py si-no` «¿hace falta recordar para esto?» (barato); si no, no se gasta ni un cálculo |
| **Enjambre** (agentes que programan) | un índice del repo de StarSeed (código troceado por AST y `architecture/*.md`) en el A1: `contexto_agente.py` añade «Archivos que probablemente importan» a cada tarea. Hoy busca con codegraph y nombres |
| **Meta^n** (`architecture/automejora-meta-n.md`) | después, con recuerdos aceptados o rechazados como verdad, ajusta `top_k`, `complexity` y el peso BM25/vector por capa con su juez (ola propia) |
| **Mausbot, bots y personalidades** | usan el mismo «recordar» de Astraura: no hay otro camino |
| **Malla** | el índice es pequeño y viaja como un archivo más de la cuenta. La búsqueda necesita el mismo modelo de incrustaciones donde corra, así que corre en el servidor de cerebro (hoy el A1) y las neuronas le preguntan por el túnel |

**Modelo de incrustaciones:** `qwen3-embedding:0.6b` por Ollama.
- Descarga de 639 MB, más de 100 idiomas: el contenido es en español. Licencia Apache-2.0 de Qwen, que se comprueba con
  `ollama show --license` antes de instalar.
- Se carga solo cuando hay que construir o buscar (`OLLAMA_KEEP_ALIVE=2m`) y es el único modelo de Ollama cargado.
- Se registra en `config/capas-astraura.json` como entrada «por-verificar» hasta tener su SHA-256 (regla de las capas).

## 3. El servidor de recuerdo semántico (A1)

- **`scripts/puente/leann_servidor.py`** (stdlib `http.server` + la API de Python de LEANN). Se usa este y no el servidor
  de LEANN porque ese no autentica y su búsqueda HTTP no acepta filtros.
  - Escucha en **127.0.0.1:4495**, con token en `~/.starseed/leann.token` (0600) y cabecera `X-StarSeed-Token`.
  - Rutas:
    - `GET /salud`
    - `GET /indices`
    - `POST /indices/<nombre>/buscar` `{consulta, k, filtros?, peso_vector?}` → `[{id, puntuacion, texto, metadatos}]`
    - `POST /indices/<nombre>/poner` `{textos: [{texto, metadatos}]}` (añade con `update_index`)
  - Un `LeannSearcher` por índice en una caché de 4.
- **Índices** en `/var/lib/starseed/leann/<nombre>/` (`<tipo>-<id>-<alcance>`, como las cápsulas, y `repo-starseed`).
  - Construcción de noche, en la misma franja que Meta^n (un trabajador menos, DEC1028B).
  - Durante el día, solo añadidos pequeños.
- **Entorno** `/opt/starseed/leann/.venv` con `leann==0.3.8` (fijado; lo sube la Biblioteca cuando haya etiqueta nueva y
  pasen las pruebas).
- **Servicio** `starseed-leann.service` (`MemoryMax=1500M`, `Nice=10`) con
  `# requiere: /opt/starseed/leann/.venv/bin/python`.
- **La Mac llega** por el túnel que ya abre `scripts/puente/tunel_metagenesis.py` (reenvío 4495), y **las demás neuronas**
  por el servidor de cerebro (`architecture/apps-en-la-malla.md`).
- **Sin el servidor:** el recuerdo sigue con Memvid (BM25 y tiempo) y nada falla.

## 4. Cómo se mezcla con Memvid

`recordarDeCapsulas` (MVD1027F) pasa a `recordar` (LNN1028F):
1. Juicio: ¿hace falta?
2. Cápsulas y sujetos del contexto (`capsulasParaContexto`).
3. Por cada uno, **a la vez**:
   - Memvid `buscar` (palabras, y lo más reciente primero si la pregunta habla de tiempo);
   - LEANN `buscar` con `filtros {alcance: {in: visibles}}` y `peso_vector` 0,7.
4. **Fusión por rango recíproco** (RRF, k = 60) con dedupe por `uri`.
5. `filtrarParaAlcance` y `detectarFuga`.
6. Bloque «RECUERDOS».

El mismo módulo lo usan Jev (Python) y los agentes.

**Al escribir** también se funden: la ruta de cápsulas (`src/app/api/memorias/capsulas/route.ts`, MVD1027D), al
`poner` en una cápsula, pone el mismo texto en el índice LEANN del mismo sujeto y alcance si el servidor responde. Si no
responde, lo apunta en una lista de pendientes que la pasada nocturna recoge. De noche se compactan los índices y se
reconstruye el del repo.

## 5. Biblioteca

`lib-leann` en `config/repos-libreria-1028.json`: canal `tags` (`^v\d+\.\d+\.\d+$`; hoy `v0.3.8`), estado «activo».

## 6. Lo que NO se hace

- No se instala en la Mac (disco).
- No se abre su servidor sin token ni fuera de 127.0.0.1.
- No se usan incrustaciones en la nube: `openai` solo con un extremo local.
- Ningún índice colectivo ve memoria personal.
- No se descargan modelos sin pasar su licencia.

## 7. Ola LNN1028 (≤ 3 archivos y ≤ 120 líneas por archivo y tarea)

Cola `starseed_memory_root/olas/cola-leann-1028.json`:

| Tarea | Qué |
|---|---|
| A | fusión RRF (puro, TS y Python) |
| B | servidor |
| C | instalación en el A1, servicio y orden de `oracle_nodo` |
| D | pasada nocturna: pendientes, compactar y el índice del repo |
| D2 | escritura doble cápsula → índice |
| D3 | servicio y temporizador de la pasada nocturna |
| A2 | la misma fusión en Python |
| E | túnel |
| F | `recordar` en Astraura |
| G | contexto de los agentes |
| H | entrada del modelo de incrustaciones en capas |
| I, I2 | Biblioteca |

**Verificación:**
- Pruebas de cada tarea.
- En el A1: `/salud`, un índice de prueba con 20 textos en español, y que «¿qué dije de la cafetería?» encuentra
  «planes del café» (sin palabras en común).
- La búsqueda con filtro de alcance no devuelve nada personal.
- `contexto_agente.py` sugiere archivos reales para una tarea de prueba.
- En localhost:9002, el bloque de recuerdos en un chat de Astraura.
