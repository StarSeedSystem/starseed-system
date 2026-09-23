# Servidor Laya Local (ModernBERT)

Servidor HTTP de decisiones tipadas local compatible con la API de Jev (`POST /v1/systemone`).

- **Puerto:** `127.0.0.1:4470`
- **Modelo:** `@receptron/laya` (ModernBERT multilingüe)
- **RAM requerida:** ~1.7 GB en disco/pesos, ~2 GB en RAM (~2500 MB libres para cargar)
- **Carga:** Perezosa en la primera petición, descarga automática tras 10 min de inactividad

## Endpoints

- `GET /status`: estado del modelo (`cargado`, `ramLibreMb`, `motivo`)
- `POST /v1/systemone`: `{ state, questions }` -> `{ answers, usage, ms }`

## Uso

```bash
npm install
node servidor-laya.mjs
```
