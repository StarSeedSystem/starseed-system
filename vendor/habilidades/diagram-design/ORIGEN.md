# Diagram Design para la IA de Astraura

- Origen: https://github.com/cathrynlavery/diagram-design, commit 550fd66 (2026-10-16), plugin 2.6.110. Licencia MIT
  (ver `LICENSE` y `THIRD_PARTY_LICENSES.md`). Sin servidor ni telemetría (según el PRIVACY.md del repositorio de origen, que no se copia).
- Se copian el SKILL.md, `references/` (45 tipos de diagrama, estilo, animación, perfiles de marca, importar draw.io,
  Mermaid y Excalidraw), `scripts/` (extractores e informes, Python) y solo las plantillas y 6 ejemplos de `assets/`.
- Reglas StarSeed (contrato `architecture/diagramas.md`): las fuentes se sirven desde el OS (sin Google Fonts en
  tiempo de uso); el HTML generado se muestra siempre en un iframe aislado sin acceso al OS; la marca sale de los
  tokens de tema de cada perfil, página o grupo.
- Claude la tiene instalada aparte como plugin de Claude Code (marketplace de GitHub con autoactualización).
- Se renueva entera cuando el vigía (área `habilidades`) avisa de una versión nueva; nunca a mano.
