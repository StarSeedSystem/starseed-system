# Cápsulas de memoria Memvid en las memorias, capas, agentes, personalidades, perfiles y páginas (MVD1027)

**Pedido de Alex (2026-10-27):** «al igual que este [Meta^n], en las memorias y capas, agentes, personalidades,
perfiles, páginas, donde corresponda» — https://github.com/memvid/memvid (y en la Biblioteca autoactualizable).

## 1. Qué es Memvid (medido el 2026-10-27)

- **Una capa de memoria en un solo archivo** (`.mv2`). Guarda en el mismo archivo los datos, el índice de texto
  (BM25 con Tantivy), los vectores (HNSW, opcional), la línea del tiempo y los metadatos. No necesita base de datos
  ni servidor.
- **Escritura «solo añadir».** La escritura es por **fotogramas** («Smart Frames») inmutables, con hora, suma de
  comprobación y metadatos. Por eso permite viajar en el tiempo (consultar estados pasados), repetir sesiones de
  agentes (`replay`) y sobrevivir a un corte (WAL dentro del archivo).
- **Licencia y versiones:**
  - **Núcleo en Rust** `memvid-core`, **Apache-2.0**. Última etiqueta y crate `v2.0.140` del 2026-05-27; último
    commit del 2026-07-14 (README). Rust ≥ 1.85, edition 2024.
  - **SDKs** de Node (`@memvid/sdk`), Python (`memvid-sdk`) y CLI (`memvid-cli`): 2.0.160 del 2026-05-27,
    Apache-2.0.
  - Formato: `MV2_SPEC.md` 2.1.
- **Funciones opcionales:** `lex` (por defecto), `vec` (incrustaciones locales con ONNX: descarga modelos), `clip`
  (imágenes), `whisper` (audio), `logic_mesh` (entidades), `temporal_track`, `replay`, `encryption` (cápsulas
  cifradas `.mv2e` con contraseña: Argon2 + AES-GCM) y `api_embed` (incrustaciones por API: necesita red y claves).
- **Lo que hay que saber antes de usarlo:**
  1. **Tope por archivo:** sin un «ticket» firmado por memvid.com, cada `.mv2` tiene **50 MB**
     (`Tier::Free`, `src/types/common.rs`; algún comentario dice 1 GB, el código dice 50 MB). StarSeed **no** pide
     tickets ni rodea esa comprobación: reparte en varias cápsulas (§3).
  2. **Telemetría:** el SDK de Node manda telemetría anónima a `memvid.com/api/analytics/ingest`, **encendida por
     defecto**. Se apaga con `MEMVID_TELEMETRY=0`.
  3. **El SDK de Node pesa mucho:** depende de langchain, llamaindex, ai, exceljs, OCR… y su parte nativa son
     binarios precompilados cuyo código de enlace no está en el repo.
  4. **El núcleo en Rust no usa la red** (reqwest solo entra con `api_embed`).
- **No hay versión para navegador** (Tantivy y mmap): en el navegador y el móvil se consulta por el servidor de la
  neurona o el servidor de cerebro de la malla.

**Decisión:** StarSeed usa el **núcleo en Rust** (público, auditable, sin red) dentro de un servidor propio pequeño,
`native/memvid-servidor`, con `lex`, `temporal_track` y `encryption`. El SDK de Node no entra en el bundle ni en
el servidor. `vec` llega en una ola propia, con el visto bueno de cada neurona para descargar el modelo ONNX.

## 2. Una cápsula por sujeto, con su alcance

`src/lib/memorias/capsulas.ts` (PURO):

- **Cada sujeto tiene sus cápsulas:** perfil, personalidad, agente, bot, página, grupo, comunidad, cerebro y capa
  de conciencia.
- **Alcance:** cada cápsula lleva el de `src/lib/nucleo/alcance-memoria.ts` (personal › perfil › grupo › pública).
  - Quién la lee o escribe sale de `alcanceVisiblePara` y `puedeEscribirEn`; nunca se sube de alcance.
  - Una cápsula personal o de perfil va **cifrada en reposo** (`.mv2e`, `memvid_core::encryption::lock_file` y
    `unlock_file`).
    - Mientras está abierta en el servidor, su copia descifrada vive en `~/.starseed/memvid/abiertas/` (0700); se
      vuelve a cifrar tras cada `commit` y al apagar.
    - Las réplicas de la malla viajan siempre cifradas.
    - La contraseña vive en el llavero de la neurona (`~/.starseed/memvid.claves`, 0600, una por cápsula), nunca en
      el repo, ni en las memorias de Claude, ni en la malla en claro.
- **Nombre:** `<tipo>-<id>-<AAAA>T<trimestre>.mv2`, por ejemplo `personalidad-aurora-2026T4.mv2`.
- **Reparto por tamaño:** al llegar a 45 MB se abre la siguiente (`-2026T4b`). Las búsquedas recorren las cápsulas
  del sujeto de la más nueva a la más vieja y paran al llenar `k`.

## 3. Dónde corresponde (y cómo se escribe y se lee)

| Dónde | Qué guarda la cápsula | Cómo entra |
|---|---|---|
| **Cerebros** | sus archivos de memoria | **destino nuevo** de `src/lib/brains/memory-destinations.ts` (`capsula: { enabled }`, junto a local, starseed, external y p2p): en cada sincronía se añaden solo los archivos nuevos o cambiados (por su huella) |
| **Personalidades** | lo aprendido en sus conversaciones | al guardar una memoria con esa personalidad activa |
| **Agentes y bots** | sus sesiones: pasos, herramientas, resultado | un fotograma por paso; con `replay` se repite la sesión. Son también **trazas para Meta^n** (`architecture/automejora-meta-n.md`) |
| **Perfiles** | memoria personal y de perfil (cifrada) | las mismas memorias del baúl (`src/lib/memory-vault.ts`) con su alcance |
| **Páginas, grupos y comunidades** | su conocimiento público o de grupo | lo que la entidad aprueba; se comparte como cápsula sellada (solo lectura) por la Biblioteca o Variaciones |
| **Capas de conciencia** | la capa **memoria** del planificador | Astraura busca en las cápsulas del contexto (chat × personalidad × perfil × página) antes de responder |

- **Lectura en Astraura** (`src/ai/astraura/router.ts`, junto a la nota de configuración del chat):
  - `recordarDeCapsulas(contexto, consulta)` añade un bloque «RECUERDOS (cápsulas Memvid)» con los k mejores
    fragmentos (≤ 1.500 caracteres en total).
  - Solo trae lo que `filtrarParaAlcance` deja para ese actor y pasa `detectarFuga` antes de salir hacia un modelo
    de la nube.
  - Si el servidor de cápsulas no responde, no hay bloque y nada falla.
- **Un escritor por cápsula (malla):** escribe solo la neurona que tiene el arriendo de ese sujeto (el servidor de
  cerebro, `architecture/apps-en-la-malla.md`).
  - Las demás leen **réplicas selladas** (`open_read_only`) que viajan como cualquier archivo de la cuenta (réplicas,
    espejo).
  - Una escritura desde otra neurona va por la malla al escritor.
  - El cerrojo de Memvid (error MV007) se respeta: nunca dos escritores.

## 4. El servidor de cápsulas (`native/memvid-servidor`, Rust)

- **Dependencia:** `memvid-core = "=2.0.140"` con las funciones `lex`, `temporal_track` y `encryption`
  (sin `api_embed` ni `vec`).
- **Escucha** en **127.0.0.1:4490**, por HTTP con `tiny_http`. Cada petición lleva la cabecera
  `X-StarSeed-Token` con el contenido de `~/.starseed/memvid.token` (0600); sin token, `Host` distinto de 127.0.0.1
  o `Origin` de fuera, da 403.
- **Carpeta de cápsulas:** `STARSEED_MEMVID_DIR`, por defecto `~/.starseed/memvid/`.
- **Rutas:**

  | Ruta | Qué hace |
  |---|---|
  | `POST /capsulas/<nombre>/poner` | `{texto, titulo?, uri?, etiquetas?, ts?}` → `{frame}`; añade y hace `commit` |
  | `POST /capsulas/<nombre>/buscar` | `{consulta, k}` → `{aciertos: [{titulo, texto, uri, ts}]}` |
  | `GET /capsulas/<nombre>/estado` | fotogramas, tamaño, tope y cuánto queda |
  | `GET /capsulas/<nombre>/linea?desde&hasta` | la línea del tiempo |
  | `GET /salud` | si el servidor está vivo |

  `<nombre>` solo admite `[a-z0-9-]` y `.mv2`, sin `/` ni `..`.
- **Dónde corre:**
  - **A1:** compila con el `cargo` que ya tiene (`/home/starseed/.cargo/bin`, medido) y corre como
    `starseed-memvid.service`.
  - **Mac:** no tiene Rust (medido) y le quedan ~5,5 GB de disco, así que el binario `darwin-arm64` sale de un job de
    GitHub Actions como artefacto del run (no es una publicación) y lo instala `scripts/puente/instalar_memvid.py`
    con `gh run download`.
  - **Comprobación:** la comprobación en la nube (`comprobar-nube.yml`) pasa `cargo test` cuando una tarea toca
    `native/memvid-servidor/`.
- **Clientes:**
  - TS (solo servidor): `src/lib/memorias/memvid-cliente.ts`, con la ruta `src/app/api/memorias/capsulas/route.ts`,
    que comprueba actor y alcance.
  - Python: `scripts/puente/memvid_cliente.py` (stdlib), para los agentes del puente y `contexto_agente.py`.

## 5. Configurable (Ajustes de cada sujeto · «Memoria en cápsula»)

- Encendido por sujeto (clave `starseed.memorias.capsulas.v1`, viaja con la cuenta), **apagado por defecto** en todas las
  cuentas. En la de Alex se encienden sus cerebros y personalidades al verificar la ola.
- Tamaño y cuánto queda.
- Línea del tiempo.
- «Exportar mi cápsula» e «Importar una cápsula», para llevarse la memoria.
- «Cifrada», obligatorio en personal y perfil.
- Un componente común (`src/components/memorias/capsula-ajustes.tsx`) montado en el editor de personalidad, los
  ajustes del perfil, los de la página o grupo y la ficha del agente o bot.

## 6. Biblioteca

`lib-memvid` en `config/repos-libreria-1027b.json`:

- Canal `tags` (`^v\d+\.\d+\.\d+$`; hoy `v2.0.140`).
- Al salir una etiqueta nueva, Genesis lo dice y `native/memvid-servidor` sube la versión fijada en una tarea del
  enjambre (nunca solo).

## 7. Lo que NO se hace

- No se crea cuenta en memvid.com, ni se usan sus claves `mv2_`, ni sus tickets, ni se rodea el tope de 50 MB.
- No entra el SDK de Node. Si algún día entra en el servidor, va con `MEMVID_TELEMETRY=0`.
- No se usa `api_embed`.
- Nada personal en cápsulas sin cifrar.

## 8. Ola MVD1027 (≤ 3 archivos y ≤ 120 líneas por archivo y tarea)

Misma cola que Meta^n: `starseed_memory_root/olas/cola-meta-n-memvid-1027.json`. Orden:

| Tarea | Qué |
|---|---|
| A | cápsulas (puro) |
| B | malla: escritor y réplicas (puro) |
| C | servidor Rust |
| C2 | `cargo test` en la comprobación en la nube |
| D | cliente TS y ruta |
| E | destino «cápsula» de los cerebros |
| F | recuerdos en Astraura |
| G | cliente Python y agentes |
| H0 | qué sujetos tienen cápsula (sincronía) |
| H | ajustes por sujeto: personalidades y bots |
| H2 | perfiles, páginas, grupos y cerebros |
| I | A1: servicio y orden en `oracle_nodo` |
| J | binario de la Mac por Actions |

**Verificación:**
- `cargo test` y vitest y pytest de cada tarea.
- En el A1, `curl` con el token a `/salud` y una cápsula de prueba (poner, buscar, línea).
- En la Mac, con el binario instalado: un cerebro con el destino «cápsula» crea su `.mv2` y en el chat de Astraura
  sale el bloque de recuerdos con la personalidad de ese cerebro.
- En localhost:9002, los ajustes de una personalidad enseñan su cápsula.
