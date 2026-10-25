# Origen

- Repositorio: https://github.com/VoltAgent/awesome-design-md (Alex lo dio como `voltagent`).
- Licencia: MIT (texto en `LICENSE`). El README declara 84 fichas DESIGN.md; son análisis «inspirados en» sitios de
  terceros. Las marcas, logotipos y fuentes citadas son de sus dueños.
- Versión: sin etiquetas ni lanzamientos. Se sigue por commits en `main`. Copiada: commit `3b60532` del 2026-10-14
  («Remove AI Design + Build Ecosystem Tools section»), el 2026-10-25.
- Se copian: `LICENSE`; `INDICE.md` (generado a partir del apartado «Collection» del README: 83 marcas por categoría
  más `slack`, con la dirección «raw» de cada una); y dos archivos de ejemplo de formato (Kraken, numerado; Supabase,
  alfa) para que un agente vea la forma sin descargar nada.
- NO se copian: las 84 carpetas `design-md/<marca>/`, el `CONTRIBUTING.md` y las imágenes del README: no.
  Las fichas se leen de una en una por HTTPS cuando se necesitan.
- Revisión de seguridad (2026-10-25, solo leyendo; no se ejecutó nada): el repo es solo texto Markdown, sin scripts,
  sin dependencias, sin claves, sin telemetría. Riesgos: (1) contenido de terceros que un agente podría tomar como
  instrucciones: el `SKILL.md` lo prohíbe; (2) uso de marca ajena: ver `STARSEED.md`; (3) el README enlaza un servicio
  de pago del autor (getdesign.md) para pedir fichas DESIGN.md privadas: no se usa.
- El repo no es una skill: el `SKILL.md` lo ha escrito StarSeed (y así consta en su cabecera).

## Cambios de StarSeed

- `SKILL.md` (nuevo, de StarSeed), `STARSEED.md` (nuevo), `INDICE.md` (generado).
- Se renueva el índice y los ejemplos cuando el vigía avise de commits nuevos en `main`; nunca a mano. Comprobar tras
  cada renovación que el número de carpetas coincide con la insignia «DESIGN.md count» del README.
