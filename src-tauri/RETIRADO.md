# `src-tauri/` (raíz) está retirado — la app nativa vive en `native/src-tauri/`

Nadie compila esta carpeta desde el 2026-09-24:

- `.github/workflows/native-build.yml` construye `native/` (OS, Nexus y Café; macOS, Windows, Linux y Android).
- `.github/workflows/ci.yml → tauri-check` hace `cargo check --manifest-path native/src-tauri/Cargo.toml`.

Esta carpeta es el primer intento (`identifier org.starseed.os`, solo updater). Se deja para no romper
enlaces viejos. **No la arregles creyendo que es la app:** cualquier cambio de la app nativa va en
`native/src-tauri/`. Contrato vigente: `architecture/apps-nativas-segundo-plano.md`.
