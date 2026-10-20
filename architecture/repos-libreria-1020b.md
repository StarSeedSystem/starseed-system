# 2.ª tanda: 14 repos más en la Biblioteca, preinstaladas con criterio e integradas por área (Ola 1020S)

Petición de Alex (2026-10-20, por la tarde): integrar en la Biblioteca de StarSeed OS, autoactualizadas,
predeterminadas y preinstaladas «inteligentemente», y también para Claude, Genesis, Astraura, la
Protomolécula, los cerebros, las cuentas y los perfiles, en todos sus medios útiles, analizando cada una
para su instalación integral y funcional. Catálogo verificado: `config/repos-libreria-1020b.json`. Sigue el
contrato de la 1.ª tanda (`architecture/repos-libreria-1020.md`): mismo cargador, mismos canales, misma
honestidad.

## 1. Qué es cada una de verdad (verificado el 2026-10-20)

| Repo | Para qué lo quiere Alex | Qué es | Licencia | Efecto | Preinstalar |
|---|---|---|---|---|---|
| ruvnet/RuView | habilidades de la malla y «radar» | sensado WiFi con ESP32 (presencia, pulso, pose) + MCP | MIT | herramienta de agentes | manual (vigilancia: solo con consentimiento) |
| go-vikunja/vikunja | tareas y proyectos de redes, grupos, comunidades, páginas, gobernanza ejecutiva, recursos colectivos, estudio, cerebros | gestor de tareas autoalojable, API REST | AGPL-3.0+ | conector (A1) | siempre (ficha y conector) |
| denoland/celld | donde sea útil | Workers y Durable Objects autoalojados (SQLite replicado) | Apache-2.0 | catálogo | siempre (ficha) |
| getsentry/sentry | autorreparación de errores de todo el OS | seguimiento de errores con SDK abiertos | FSL-1.1 (no OSI) | catálogo + formato de eventos | siempre (ficha) |
| windmill-labs/windmill | donde sea útil | scripts → flujos, trabajos programados, webhooks | AGPL + Apache + propietario | conector | siempre (ficha y conector) |
| metabase/metabase | análisis de datos y gráficas verificables | analítica y paneles, API REST | AGPL + comercial | conector (réplica de lectura) | siempre (ficha y conector) |
| TriliumNext/Trilium | notas de perfiles, grupos, comunidades, archivos, páginas | notas jerárquicas con ETAPI | AGPL-3.0+ | conector | siempre (ficha y conector) |
| tirrenotechnologies/tirreno | seguridad del OS y la red | antifraude: toma de cuentas, bots, abuso | AGPL-3.0 | conector | manual (datos sensibles) |
| nisrulz/app-privacy-policy-generator | seguridad y privacidad | generador web de políticas de privacidad | AGPL-3.0 | catálogo (enlace) | siempre |
| ARahim3/DigUp | buscadores y memoria de los cerebros | buscador local por significado (Apple Silicon) | MIT | herramienta de agentes (Mac) | manual |
| lexmount/moli | internet para Astraura y los agentes | navegador sin interfaz para agentes (Rust) | Apache-2.0 o MIT | herramienta de agentes (A1) | manual |
| NVIDIA/OpenShell | privacidad y seguridad de agentes | sandboxes con política de red y archivos | Apache-2.0 | herramienta de agentes | manual (alfa, telemetría apagada) |
| Louis-CFM/coucou | «para nosotros en Claude» | app compañera que ve y aprueba sesiones de Claude Code | MIT + activos reservados | catálogo | manual (toca la configuración de Claude Code) |
| t8y2/dbx | bases locales de servidores, neuronas y capas de conciencia | cliente de bases con CLI, MCP y web | Apache-2.0 | herramienta de agentes (MCP solo lectura) | manual |

**Excluida:** `Vikunja-Self-Hosted/Vikunja-Task-Management` no es Vikunja: repositorio sin código con README
de relleno SEO y un botón de descarga hacia un dominio ajeno (probable señuelo). Se usa el original
`go-vikunja/vikunja` y este enlace queda bloqueado en el catálogo (`excluidas`).

## 2. Decisiones honestas

- **«Preinstalar inteligentemente»** = sembrarlas en `defaults-seed.ts` (nueva `SEED_VERSION`) SOLO cuando
  instalar no hace nada más que registrar la ficha, el enlace o el conector. Lo que ejecuta código, toca datos
  sensibles o se instala en la máquina de Alex queda «manual» con su motivo a la vista.
- **Autorreparación de errores:** Sentry no cabe autoalojado (16 GB + 16 GB de swap) y su FSL no es abierta.
  Genesis recoge errores con el formato de evento del SDK de Sentry (para poder usar sus SDK y, si Alex
  quiere, un servidor compatible), quita los datos personales, agrupa por huella y los pasa a la autocuración
  que ya existe. El servidor compatible es decisión de Alex.
- **Decisiones democráticas:** se quedan en la gobernanza del OS (una persona, una voz). Vikunja ejecuta lo
  decidido: el proyecto de un grupo o de un sector recibe las tareas que salen de una propuesta aprobada.
- **Seguridad de agentes:** Moli navega solo dentro de un sandbox de OpenShell con lista de dominios
  permitidos; el contenido web es dato, nunca instrucción. dbx siempre en solo lectura.
- **RuView** es sensado de radiofrecuencia: choca con el principio de no vigilancia si se enciende sin
  consentimiento. Solo opt-in, con todos los presentes de acuerdo, y los datos en la neurona.

## 3. Tareas del enjambre (cola `cola-repos-libreria-1020b.json`)

Fase 1, Biblioteca y conectores: RLB1020D (cargador lee las dos tandas y respeta `excluidas`), RLB1020E
(siembra por defecto de las «siempre»), RLB1020F (canal de etiquetas con patrón, para RuView), RLB1020G1 y
RLB1020G2 (conectores autoalojados en el Hub). Fase 2, integración por área: RLB1020H (cliente puro de
Vikunja: un proyecto por grupo, comunidad, página o cerebro), RLB1020I (cliente puro de ETAPI de Trilium
para los cerebros), RLB1020J (eventos de error con formato Sentry, limpieza de datos personales y huella para
la autocuración de Genesis).

Las herramientas para Claude y para los agentes en la Mac y el A1 (dbx MCP en solo lectura, skills de Moli,
CLI de DigUp, OpenShell con telemetría apagada, Coucou) piden descargar e instalar programas: se instalan
solo con la palabra de Alex, una por una.
