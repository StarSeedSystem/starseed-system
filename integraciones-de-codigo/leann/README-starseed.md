# LEANN · lo que el enjambre necesita saber sin abrir el repo

[StarTrail-org/LEANN](https://github.com/StarTrail-org/LEANN), **MIT** (`LICENSE` de aquí, sin cambios). Fijado a
**`leann==0.3.8`** (etiqueta `v0.3.8`; PyPI 2026-09-28). Python ≥ 3.10. Leído el 2026-10-28 con un clon de solo lectura;
aquí NO hay código suyo. Contrato del OS: `architecture/leann-recuerdo-semantico.md`.

## Instalar (solo en el A1, nunca en la Mac)

```bash
python3 -m venv /opt/starseed/leann/.venv
/opt/starseed/leann/.venv/bin/pip install --no-cache-dir "leann==0.3.8"   # arrastra torch y sentence-transformers (~1,5–2 GB)
ollama pull qwen3-embedding:0.6b                                         # 639 MB; antes: ollama show qwen3-embedding:0.6b --license
```

## API de Python (`from leann import LeannBuilder, LeannSearcher`)

```python
# Ollama: el servidor sale de OLLAMA_HOST / LEANN_OLLAMA_HOST (settings.resolve_ollama_host); en el A1, 127.0.0.1:11434
b = LeannBuilder(backend_name="hnsw", embedding_model="qwen3-embedding:0.6b", embedding_mode="ollama")
b.add_text("texto", metadata={"alcance": "perfil", "sujeto": "perfil:alex", "uri": "mv2://..."})
b.build_index("/var/lib/starseed/leann/perfil-alex-perfil/documents.leann")
b.update_index(ruta, remove_passage_ids=None)    # añadir lo nuevo a un índice que ya existe (tras add_text)

s = LeannSearcher(ruta)                          # el modo y el modelo salen de los metadatos del índice
r = s.search("consulta", top_k=5, complexity=64,
             metadata_filters={"alcance": {"in": ["perfil", "publica"]}},
             vector_weight=0.7)                  # 1.0 = solo vectores; menos = mezcla con su BM25 (FTS5)
# r: list[SearchResult] con .id, .score, .text, .metadata
```

- **Operadores de `metadata_filters`:** `==`, `!=`, `<`, `<=`, `>`, `>=`, `in`, `not_in`, `contains`, `starts_with`,
  `ends_with`, `is_true`, `is_false`.
- **`--recompute` / recálculo:** viene encendido y es lo que ahorra el 97 % del disco. No se busca «sin recálculo» en un
  índice construido «con recálculo».

## CLI (para pruebas a mano en el A1)

`leann build NOMBRE --docs CARPETA --embedding-mode ollama --embedding-model qwen3-embedding:0.6b`,
`leann search NOMBRE "consulta" --top-k 5`, `leann list`, `leann remove NOMBRE`, `leann watch`.

## Lo que NO se usa

- Su servidor HTTP (`leann/server.py`: FastAPI en `127.0.0.1:8000`, **sin autenticación**, y su búsqueda no acepta
  filtros). StarSeed usa el suyo propio, `scripts/puente/leann_servidor.py`, en el puerto 4495 y con token.
- `LeannChat` (StarSeed responde con sus capas).
- El modo de incrustaciones `openai` hacia la nube.
