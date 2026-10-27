# Memvid · la API del núcleo que usa `native/memvid-servidor` (sin abrir el repo)

[memvid/memvid](https://github.com/memvid/memvid), **Apache-2.0** (`LICENSE` de aquí, sin cambios). Crate
`memvid-core` **=2.0.140** (etiqueta `v2.0.140`, 2026-05-27; Rust ≥ 1.85, edition 2024). Leído el 2026-10-27 con un
clon de solo lectura; aquí NO hay código suyo, solo las firmas que hacen falta. Contrato: `architecture/memvid-capsulas.md`.

```toml
[dependencies]
memvid-core = { version = "=2.0.140", default-features = false, features = ["lex", "temporal_track", "encryption"] }
tiny_http = "0.12"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

`default-features = false` quita `pdf_extract` y `simd`. **No** añadir `api_embed` (red y claves) ni `vec` (descarga
modelos ONNX); eso es otra ola.

## Firmas

```rust
use memvid_core::{Memvid, PutOptions, SearchRequest, TimelineQuery, Stats, MemvidError};   // todo en la raíz del crate

let mut mem = Memvid::create("perfil-x-2026T4.mv2")?;     // crea el archivo nuevo (comprueba antes si ya existe)
let mut mem = Memvid::open("perfil-x-2026T4.mv2")?;       // existente, escritura (cerrojo: error MV007 si otro la tiene)
let mut mem = Memvid::open_read_only("replica.mv2")?;     // réplicas de la malla (search y timeline piden &mut)

let opts = PutOptions::builder()
    .title("Recuerdo").uri("mv2://personalidad/aurora/123")
    .tag("alcance", "perfil").timestamp(1761600000)       // segundos
    .build();
let frame_id: u64 = mem.put_bytes_with_options(texto.as_bytes(), opts)?;
mem.commit()?;                                            // sin commit no queda

let r = mem.search(SearchRequest { query: "planes".into(), top_k: 5, snippet_chars: 300, ..Default::default() })?;
for h in r.hits { /* h.rank, h.frame_id, h.uri: String, h.title: Option<String>, h.text: String, h.score: Option<f32> */ }

let linea = mem.timeline(TimelineQuery::builder().since(desde).until(hasta).build())?;
// Vec<TimelineEntry { frame_id, timestamp, preview: String, uri: Option<String>, .. }>

let s: Stats = mem.stats()?;   // frame_count, size_bytes, capacity_bytes, tier, has_lex_index, has_time_index…
let tope: u64 = mem.get_capacity();
let n: usize = mem.frame_count();
```

- **Viaje en el tiempo:** `SearchRequest` tiene `as_of_frame: Option<FrameId>` y `as_of_ts: Option<i64>`.
- **Cifrado en reposo:**

  ```rust
  use memvid_core::encryption::{lock_file, unlock_file};
  lock_file(".../x.mv2", Some(Path::new(".../x.mv2e")), clave)?;    // -> PathBuf
  unlock_file(".../x.mv2e", Some(Path::new(".../abiertas/x.mv2")), clave)?;
  ```

## El tope que no se rodea

Sin ticket firmado por memvid.com, cada archivo tiene **50 MB** (`Tier::Free`, `src/types/common.rs`). Pasarse da
`MemvidError::CapacityExceeded { current, limit, required }`. StarSeed abre la cápsula siguiente del mismo sujeto
al llegar a 45 MB (`src/lib/memorias/capsulas.ts`). Nunca se llama a `apply_ticket` ni a `apply_signed_ticket`.

## Errores con código (los mismos que enseña el SDK)

- `MV007`: archivo bloqueado por otro proceso. Solo un escritor por cápsula.
- `MV008`: pide una clave de memvid.com. Es una función de pago: StarSeed no la usa.
