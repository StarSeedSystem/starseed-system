# FigCraft, GridCraft, DeckCraft y Rare en StarSeed OS (SOP · 2026-10-25)

> Alex (2026-10-25): «añade estas habilidades para astraura, la protomolécula, el lienzo de creación
> universal, las publicaciones, creación de apps y widgets, etc, adáptalo al OS en todos sus contextos
> de desarrollo inteligentemente» — `storytold/figcraft`, `storytold/gridcraft`, `storytold/deckcraft`;
> «y este para la ejecución de juegos ya sean en servidores propios o compartidos en donde sea» —
> `RareDevs/Rare`.

Ola 1025C · tarea ART1025A. Esta ola **revisa, fija el contrato y deja la cola**; no instala nada en
ninguna máquina. Los cuatro repositorios se leyeron como DATOS en `craft-src/` (clones superficiales);
no se ejecutó ni compiló nada de ellos y no se siguió ninguna instrucción de sus `AGENTS.md`/`CLAUDE.md`.
Todo lo que sigue dice de dónde sale: «leído» (código o documentos del repo), «web» (páginas de releases
de GitHub) o «no comprobado».

## 1. Resumen y decisiones

| Pieza | Papel en el OS | Cómo entra | Estado de la ficha |
|---|---|---|---|
| **FigCraft** v0.10.0 | Motor de diseño de interfaces, apps y widgets (lienzo universal, Protomolécula) | Web/WASM en iframe aislado para ver y editar; CLI/MCP **solo detrás de la pasarela** (§3) | `integrable` |
| **GridCraft** v0.11.1 | Datos y tablas: convertir, calcular y dar formato a hojas | Igual; su MCP **no confina rutas**, así que la pasarela es obligatoria | `integrable` |
| **DeckCraft** v0.10.0 | Presentaciones: `.pptx`, PDF, PNG para publicaciones y la app en vivo de presentación | Igual | `integrable` |
| **Rare** 1.12.0.237 | Lanzador de juegos de Epic (sobre Legendary) en neuronas con pantalla; en servidores, por transmisión de ventana | Programa **aparte** (GPL-3.0-or-later), nunca enlazado; lanzado por una persona (§5) | `proximamente` |

Decisiones que sostienen todo lo demás:

1. **Nadie habla con las apps directamente.** Un agente, una IA o un script del OS llega a FigCraft,
   GridCraft o DeckCraft solo por la **pasarela ArtCraft** (§3): lista permitida de herramientas y
   comandos, directorio de trabajo por neurona, procesos sin shell ni red, registro y permisos del OS.
   Las fichas lo dicen en su `motivo`.
2. **Editable sí, ejecutable no** (regla del OS, `CLAUDE.md`): los complementos WASM de FigCraft, los
   scripts de GridCraft, las macros VBA y el código generado (CSS/React/SwiftUI) son **datos** que se
   pueden mirar y guardar, nunca algo que el OS ejecute por encargo de un agente.
3. **El OS manda sobre la interfaz.** FigCraft diseña; lo que llega al OS pasa por `UiSpec`
   (`src/lib/nucleo/ui-spec.ts`, vocabulario cerrado) y por los invariantes del núcleo, no como HTML.
4. **Entidad Única.** Un diseño, una hoja o un mazo se **referencian**, no se copian: los exportes
   (PDF, PNG, `.pptx`) son derivados de la entidad viva y se regeneran, igual que las demás publicaciones.
5. **Credenciales de Epic: siempre de la persona que las usa**, nunca en el repositorio, la memoria, una
   sala, un grupo ni un registro (§5.3).
6. **Cada neurona elige su medio** (§4.5): nativo si lo tiene, web/WASM si el navegador puede, servidor de
   la malla si no. El motivo se ve y «Abrir en…» deja forzar otro.

## 2. Revisión de seguridad y de encaje

### 2.1 Lo común a las tres Craft Apps (leído)

| Asunto | Hallazgo |
|---|---|
| Licencia | Código **MIT OR Apache-2.0** (`LICENSE-MIT`, `LICENSE-APACHE`, `Cargo.toml`); permisiva, enlazable. El **nombre y los logos de ArtCraft son marca NO abierta** (`docs/brand/LICENSE-brand.txt`): al alojar su build no se cambian ni se reutilizan. Licencias de las dependencias de Rust: **no auditadas** en esta revisión. |
| Telemetría | Su README dice «sin cuenta, sin telemetría». En el código, las únicas dependencias de red están en `crates/collab-net` (FigCraft) y en los puentes locales (`mcp/src/backend.rs` y `control_server.rs`, que escuchan en `127.0.0.1`). No se midió tráfico: es lectura de código y documentos. |
| Scripts de instalación | Se distribuyen como binarios; no hay `curl \| sh`. `cargo xtask` es de desarrollo y no se ejecuta aquí. Cada release lleva `SHA256SUMS.txt`. |
| Firma | macOS: firmado y notarizado según sus documentos (`docs/releasing.md`, README de DeckCraft y GridCraft: «Installers and executables are code-signed»). Linux, Flatpak, FreeBSD, web y servidor: **sin firma** → se verifican por `SHA256SUMS.txt`. |
| MCP | JSON-RPC 2.0 por **stdio** (nada de HTTP). Sin pantalla (`<app>-cli mcp`) o unido a una ventana abierta (`--attach <puerto>` en FigCraft, `--connect <puerto>` en GridCraft y DeckCraft). FigCraft limita cada línea a 32 MiB. |
| Canal de control | `--control <puerto>`: JSON por líneas en `127.0.0.1`, **sin autenticación**. En una máquina con varios usuarios cualquiera puede dirigir la app → **prohibido** en servidores compartidos; en una neurona personal solo con puerto al azar y sin publicarlo. |
| Confinamiento de archivos | `--automation-read-root` / `--automation-write-root` existen en **FigCraft y DeckCraft** (sesión sin pantalla; una app abierta se confina con las banderas con que arrancó). **GridCraft no las tiene**: `open_workbook`, `save_workbook` y `execute_command` aceptan cualquier ruta. |
| Formatos | Ver cada ficha. Los `.pptx`, `.xlsx` y `.fig` de fuera son entradas hostiles: ya hay límites (XLSX de 100 MB falla; la expansión de columnas está acotada), pero «sin comprobar contra un corpus real» según sus propias páginas de paridad. |
| Web | `figcraft-web-0.10.0.zip` (9,33 MB), `gridcraft-web-0.11.1.zip` (7,22 MB), `deckcraft-web-0.10.0.zip` (10,4 MB): WebAssembly estático. Piden WebGPU o WebGL2; HTTPS recomendado; `.wasm` con tipo `application/wasm`; no necesitan COOP/COEP. **No hay instancia alojada oficial verificada** (la página de FigCraft la ofrece «para alojar tú mismo»). Sin canal de control. |
| Madurez | **Alfa** las tres (FigCraft se calcula «~49 %» del camino; DeckCraft «camino a beta»; GridCraft sin corpus real de Excel). Repositorios jóvenes con versiones cada pocos días: fijar por SHA. |

### 2.2 FigCraft (v0.10.0, 22 oct 2026, web)

- **Salida a la red**: `collab.share`, `collab.publish` y `collab.host` están al alcance de `run_command`
  del MCP. Subir un archivo a `collab.craftapps.dev` (servidor público por defecto) o a otro sube **el
  documento sin cifrar de extremo a extremo** (lo dice su README). → **Vetados** en la pasarela; si
  alguna vez hace falta compartir en vivo, solo con un `figcraft-server` propio (Linux x64/arm64, ~4 MB,
  en cada release) y la palabra de la persona.
- **Complementos**: se ejecutan en `wasmi` (sin sistema de archivos, red, reloj ni aleatoriedad; con
  combustible y memoria acotados) y un servidor puede ofrecer un directorio de complementos
  (`plugin.directory.*`, `plugin.import`). Aun aislados son **código de terceros** → vetados por
  defecto (`plugin.*`, `widget.insert` de complementos).
- **Código generado** (`inspect.code`: CSS, HTML, React, Leptos, SwiftUI, Compose): se puede **leer**
  como texto; no se ejecuta ni se inserta en el OS (§4.4).
- **Formatos**: guarda `.figcraft` (un archivo comprimido), exporta SVG, PNG, JPG, WebP y PDF (con
  sangrado y CMYK), `.fig` (experimental) y abre `.fig` «con el mejor esfuerzo» y el JSON de la API REST.
- **Herramientas MCP** (leídas de `docs/mcp.md`): `list_commands`, `run_command`, `batch`,
  `create_node`, `set_properties`, `inspect_document`, `get_node`, `select`, `export`, `screenshot`,
  `open_file`, `save_file`, `undo`, `redo`, `pointer`, `key`, `type_text`, `inspect_ui`, recursos
  `figcraft://…` y cuatro prompts (`mobile_screen`, `design_system`, `landing_page`, `prototype_flow`).

### 2.3 GridCraft (v0.11.1, 22 oct 2026, web)

- **Sin confinamiento de rutas propio** (arriba). La pasarela inspecciona **toda** cadena de los
  parámetros que parezca una ruta y la exige dentro del directorio de trabajo.
- **Scripts**: son secuencias de comandos guardadas en el libro, **desactivadas al abrir un archivo**
  hasta `automate.trustScripts` (o `trusted: true` en `automate.runScript`); `denied_script_step`
  rechaza pasos que salgan del libro. → La pasarela veta `automate.trustScripts`, `automate.runScript`
  con `trusted`, `automate.recordActions` y todo `automate.*`. Las macros de `.xlsm` se conservan sin
  ejecutarse. `WEBSERVICE` y `FILTERXML` devuelven `#VALUE!` (no salen a la red).
- **Formatos**: XLSX nativo (lectura/escritura), XLSM, `.xls` (parcial), XLSB y ODS (solo valores),
  CSV/TSV/TXT, HTML y PDF (escritor propio, vía `convert`); JSON propio de depuración.
- **Herramientas MCP**: `execute_command`, `list_commands`, `inspect_workbook`, `read_range`,
  `write_range`, `set_cell`/`get_cell`, `evaluate_formula`, `select`, `format_range`, `insert_chart`,
  `create_table`, `sort_range`, `filter`, `open_workbook`/`save_workbook`/`new_workbook`,
  `undo`/`redo`, `screenshot`, `list_functions`. CLI: `eval`, `cat`, `run`, `convert`, `commands`, `mcp`.
- **Aviso**: «nunca comprobado en Excel sobre un corpus» (su paridad de formatos). No se promete
  fidelidad de Excel; se promete CSV/XLSX de datos.

### 2.4 DeckCraft (v0.10.0, 22 oct 2026, web)

- **Confina** con `--automation-read-root`/`--automation-write-root`. Su herramienta `call_app` (cualquier
  método del canal de control, solo conectado) queda **vetada**.
- **Formatos**: formato propio `.deckcraft`; abre y guarda `.pptx`, `.potx`, `.ppsx`; lee `.thmx` (solo tema); exporta PDF (diapositivas,
  notas, documentos; **la diapositiva va como imagen a resolución de impresión, no vectorial**), PNG,
  JPEG y GIF animado. SVG no se inserta (usa el respaldo PNG). No lee `.odp`.
- **Herramientas MCP**: `list_commands`, `run_command`, `batch`, `new_presentation`, `open_presentation`,
  `save_presentation`, `export`, `inspect_document`, `inspect_slide`, `render_slide`, `add_slide`,
  `go_to_slide`, `add_shape`, `add_text_box`, `set_text`, `insert_picture`, `insert_table`,
  `insert_chart`, además de las de ventana (`select`, `pointer`, `key`, `type_text`, `screenshot`) y `call_app`.
- No se encontró sistema de complementos (no comprobado exhaustivamente).

### 2.5 Rare 1.12.0.237 (28 sep 2026, web)

- **Licencia GPL-3.0-or-later** (`LICENSE`, `pyproject.toml`). Regla de la casa: **solo como programa
  aparte**, jamás enlazado ni en un Worker (`respetaReglaDeLicencia`). Depende de `legendary-gl`
  **fijado a un commit de la bifurcación `RareDevs/legendary`** (también GPL) y de PySide6.
- **Qué es**: interfaz Qt (PySide6) de Legendary, una alternativa libre al lanzador de Epic. Sin modo sin
  pantalla ni servidor; órdenes: `rare launch <juego> [--dry-run] [--offline]`, `rare login`, `--offline`.
- **Credenciales**: Legendary guarda la sesión de Epic en **JSON plano** (`user.json`) bajo
  `LEGENDARY_CONFIG_PATH` o `XDG_CONFIG_HOME` (por defecto `~/.config/legendary`); Rare no la cifra.
  El inicio de sesión usa un `webview` o un código de autorización que `rare login` imprime.
- **Red** (por lectura de `rare/`): Epic (inicio de sesión, tienda, juegos gratuitos), ProtonDB
  (resúmenes de compatibilidad), `raredevs.github.io/wring` (`workarounds.json`, `workarounds_version.json`,
  `steam_appids.json.xz`), y GitHub (`releases/latest`) para avisar de versiones. **Descarga
  datos y un ejecutable «wrapper» sin comprobar su huella** → en el OS se bloquea o se aloja con SHA fijado.
- **Binarios** (web, 1.12.0.237; todas sus versiones figuran como preliminares): macOS arm64 `.dmg`
  85,1 MB y `-macos.zip` 41,5 MB, x86_64 `.dmg` 84,3 MB; Linux AppImage arm64 56,7 MB / x86_64 57 MB y
  `-linux.zip`; Windows `.msi`, `-setup.exe`, `.zip`; Flatpak en Flathub (`io.github.dummerle.rare`).
- **Servidor**: necesita pantalla (X11 o Wayland, aunque sea virtual) y, para juegos de Windows en Linux,
  Wine o Proton; con GPU para los 3D. La CLI de Legendary (`legendary launch`) es el candidato sin
  pantalla, **no verificado** aquí.
- **Condiciones de Epic** (una cuenta por persona; compartir sesión en servidores compartidos): las decide Alex.

### 2.6 Binarios por plataforma (web, 2026-10-25; la API de GitHub estuvo denegada en esta sesión)

| Pieza | macOS (arm64 e Intel) | Linux x86_64 / arm64 | Web | CLI / servidor |
|---|---|---|---|---|
| FigCraft v0.10.0 | `figcraft-0.10.0-macos-universal.dmg` 92,4 MB | AppImage 79,8 / 77,1 MB; `.tar.gz` 84,8 / 82 MB; `.deb`, `.rpm`, Flatpak | `figcraft-web-0.10.0.zip` 9,33 MB | CLI macOS `figcraft-cli-0.10.0-macos-universal.zip` 75 MB; `figcraft-server` Linux 4 / 3,67 MB |
| GridCraft v0.11.1 | `…-macos-universal.dmg` 24,5 MB | AppImage 18,7 / 17,4 MB; `.tar.gz` 19,6 / 18,2 MB; `.deb`, `.rpm`, Flatpak | `gridcraft-web-0.11.1.zip` 7,22 MB | CLI macOS `gridcraft-cli-0.11.1-macos-universal.zip` 10,9 MB |
| DeckCraft v0.10.0 | `…-macos-universal.dmg` 83 MB | AppImage 73,1 / 70,7 MB; `.tar.gz` 77,5 / 75 MB; `.deb`, `.rpm`, Flatpak | `deckcraft-web-0.10.0.zip` 10,4 MB | CLI macOS `deckcraft-cli-0.10.0-macos-universal.zip` 69,2 MB |
| Rare 1.12.0.237 | `Rare-…-arm64.dmg` 85,1 MB; x86_64 `.dmg` 84,3 MB | AppImage 57 / 56,7 MB | no | no |

Enlaces: `https://github.com/storytold/figcraft/releases/tag/v0.10.0`, `…/gridcraft/releases/tag/v0.11.1`,
`…/deckcraft/releases/tag/v0.10.0`, `https://github.com/RareDevs/Rare/releases/tag/1.12.0.237`.
**Hueco importante**: la lista de activos solo trae un **CLI suelto para macOS**; para Linux no hay
`*-cli-*` aparte. Antes de apoyarse en el A1 u otra neurona Linux hay que ver si el `.tar.gz` o el
AppImage incluyen `<app>-cli` (no comprobado; no se descargó nada).

## 3. Contrato de integración: la pasarela ArtCraft

Un módulo del OS **por neurona** (precedente: `src/lib/conversion/filee-servidor.ts`, que llama a `filee` con
`execFile` y lista de argumentos, y la puerta `guardianMando`). Código solo de servidor para lo que lanza
procesos; la política es **pura** y la comparten cliente y servidor.

### 3.1 Qué hace

1. **Lanza** `<app>-cli mcp` como proceso hijo **sin shell**, con entorno mínimo (sin variables de
   claves), `cwd` en el directorio de trabajo y límites de tiempo, memoria y tamaño de salida.
2. **Confina** por dos vías: las banderas `--automation-read-root`/`--automation-write-root` (FigCraft,
   DeckCraft) **y** la comprobación de la propia pasarela sobre todos los parámetros que parezcan rutas
   (indispensable en GridCraft). Directorio de trabajo: `<datos de la neurona>/artcraft/<contexto>/`, con
   `entrada/` (lectura) y `salida/` (escritura); nunca el home, nunca `starseed_memory_root/`.
3. **Sin red**: en Linux, `unshare -n` o un contenedor; en macOS, `sandbox-exec` con `(deny network*)`.
   Si el aislamiento no está disponible, el proceso queda marcado «sin red no garantizada» y se deniegan
   las herramientas que podrían abrirla.
4. **Filtra** con **lista permitida** (§3.2). Lo que no está en la lista se rechaza con un motivo legible.
5. **Decide** con `decidir()` de `src/lib/protomolecula/permisos.ts` (origen `ia`/`agente`): una IA no abre
   una app nativa sola (`lanzar-externo`), y un código solo lo acepta una persona.
6. **Registra** cada llamada: quién, herramienta, huella de los parámetros y resultado. Nunca el contenido
   de los archivos ni nada parecido a una clave.
7. **No expone** el canal `--control`: si hay una ventana de la persona abierta, la pasarela se une con
   `--attach`/`--connect` a un puerto al azar de `127.0.0.1` que no sale de la neurona.

### 3.2 Lista permitida (primera versión; se ensancha por tareas, nunca por defecto)

| App | Libre (lectura) | En el directorio de trabajo | Siempre vetado |
|---|---|---|---|
| FigCraft | `list_commands`, `inspect_document`, `get_node`, `screenshot` (sin `window`), `inspect_ui`, `undo`, `redo`, recursos `figcraft://…` | `create_node`, `set_properties`, `batch`, `run_command` con ids de la lista (capas, layout, estilos, variables, exportar), `export`, `open_file`, `save_file` | `run_command` con `collab.*`, `plugin.*`, `widget.insert` de complementos; `pointer`, `key`, `type_text` desde agentes |
| GridCraft | `list_commands`, `list_functions`, `inspect_workbook`, `read_range`, `get_cell`, `evaluate_formula`, `screenshot` | `write_range`, `set_cell`, `format_range`, `insert_chart`, `create_table`, `sort_range`, `filter`, `new_workbook`, `open_workbook`, `save_workbook`, `execute_command` con ids de la lista | `automate.*` (incluye `trustScripts`, `runScript`, `recordActions`), `trusted: true`, todo `file.*` con ruta fuera del directorio |
| DeckCraft | `list_commands`, `inspect_document`, `inspect_slide`, `render_slide`, `screenshot` | `new_presentation`, `open_presentation`, `save_presentation`, `export`, `add_slide`, `add_shape`, `add_text_box`, `set_text`, `insert_picture`, `insert_table`, `insert_chart`, `batch`, `run_command` con ids de la lista | `call_app`, `pointer`, `key`, `type_text` desde agentes |

Reglas de las rutas: sin `..`, sin `~`, sin `file:` ni rutas UNC, sin enlaces simbólicos que salgan del directorio
(se resuelven antes de comparar), nombres sin espacios raros y con extensión conocida. Tamaños: entrada
≤ 100 MB (el XLSX de 100 MB ya falla en GridCraft), salida ≤ 200 MB, 120 s por llamada.

### 3.3 Confirmación por ámbito (resumen del cruce con `permisos.ts`)

- **Lectura** del directorio de trabajo: libre para el agente de la persona.
- **Escritura** en `salida/`: libre para el agente personal; para un agente de grupo, con confirmación de quien
  administra el grupo.
- **Publicar** o **sobrescribir una Entidad Única viva** (§4.3): siempre la palabra de una persona.
- **Todo lo vetado en §3.2**: nunca desde un agente. Solo la persona, desde la propia ventana de la app.

## 4. Cada contexto

### 4.1 Astraura (agentes)

- **Acción de agente** `[[ACCION: artcraft {json}]]` (mismo patrón que `[[ACCION: protomolecula …]]`,
  `src/lib/protomolecula/accion-agente.ts`): `{app, accion: "estado"|"inspeccionar"|"ejecutar"|"exportar",
  …}`. Pasa por la política y la pasarela; el agente no recibe nunca rutas absolutas, solo nombres dentro del
  directorio de trabajo.
- **Taller del agente** (`src/lib/agentes/taller.ts`): tres recursos de tipo `mcp`, origen `os`, con
  `requiere` = nombres de condiciones (nunca claves) y `maquina` según dónde esté el binario.
- **Desde Claude Code** (desarrollo, no usuarios del OS): `claude mcp add …` con las banderas de raíces; la guía
  de la Mac está en `instalar-mac.md` (fuera del repo) y las habilidades en `craft-skills/`.
- Un agente de **grupo** o público arranca sin ninguna de las tres (límites de fábrica restrictivos, como
  `agentes-grupo.ts`); se concede por grupo.

### 4.2 Protomolécula y lienzo universal

- **Cuatro fichas** en el catálogo (`catalogo-herramientas.ts`), que alimenta la Biblioteca por
  `aPaqueteBiblioteca` (ids `proto-figcraft`, `proto-gridcraft`, `proto-deckcraft`, `proto-rare`, con
  `payload.upstream` para la comprobación de versión). `IDS_APPS_ARCRAFT` pasa de 7 a 10.
- **Átomos** (`src/lib/protomolecula/atomos/`): uno web por app (`iframe-aislado`, control «solo ventana» +
  archivos por el protocolo `puente-herramientas`) y, cuando la neurona tiene el binario, un átomo nativo cuyos
  parámetros salen de `list_commands` por la pasarela.
- **FigCraft** es el motor de diseño de los lienzos de interfaz, app y widget; **GridCraft**, el de datos; **DeckCraft**,
  el de presentaciones. Cada molécula conserva su estado en el OS (`.figcraft`, `.xlsx`, `.pptx` son fuente y
  derivado, no la verdad): la verdad es la Entidad.

### 4.3 Publicaciones

- Exportar un diseño/hoja/mazo a **PDF, PNG, SVG o `.pptx`** produce un archivo en la Biblioteca del
  usuario y una **referencia** (`PostBlockType` `referencia` o `archivo`/`imagen` según el caso, en
  `src/lib/creation/post-blocks.ts`) a la Entidad viva; no se duplica el contenido.
- Un derivado se **regenera** cuando cambia su fuente; la publicación enseña de cuándo es y qué versión de la app lo generó.
- Publicar es siempre con la palabra de una persona; un agente prepara el borrador, no lo publica.
- DeckCraft exporta el PDF con diapositivas **como imagen**: para un PDF con texto seleccionable o vectorial se
  usa otra vía (impresión del navegador o PdfCraft). Se dice en la ficha.

### 4.4 Creación de apps y widgets

- **FigCraft → UiSpec**: una función pura `figcraftAUiSpec(documento)` lee `inspect_document`/`get_node` y mapea
  marcos con nombre `ss:panel|rejilla|widget|lista|texto|acciones|embebido` a los siete bloques de `TipoBloque`;
  el resultado pasa por `validarUiSpec`, `pareceCodigo` y los invariantes del núcleo (`invariantes.ts`).
  Si un nodo no tiene equivalente, el informe lo dice; nunca se emite HTML ni script.
- **Variables → tokens**: las variables de FigCraft se emparejan con los tokens del ADN (paleta Trinity,
  Rajdhani/Inter, radios 4/12/24/42 y píldora) y se avisa de los pares que no cumplen contraste.
- **Widgets**: un widget diseñado entra como bloque `widget` con su manifiesto; el widget no ejecuta nada
  de FigCraft (los widgets-complemento de FigCraft quedan vetados, §2.2).
- El **código generado** de FigCraft (React, CSS…) es solo una **referencia de lectura** para el agente de
  desarrollo; el OS no lo inserta.

### 4.5 Autoadaptación por neurona

`elegirMedioArtcraft(neurona, app)` — función pura, con motivo — decide entre:

| Medio | Cuándo | Equivale a (`apps-en-la-malla.md` §5) |
|---|---|---|
| **nativo** | La neurona es de escritorio, tiene el binario en la versión de la ficha y pasa el aislamiento | `montada` / `local` |
| **web (WASM)** | Hay navegador con WebGPU o WebGL2 y el zip web está en un volumen alojado | `por-bandas` |
| **servidor de la malla** | La neurona no puede (móvil sin WebGPU, TV, poca memoria) o la tarea es pesada | `transmitida` (ventana) o `ramificada` (órdenes `capacidad.artcraft.*` sin interfaz: convertir, renderizar, exportar) |

Las operaciones **sin interfaz** (convertir, renderizar, exportar) son las que se prestan por la malla; la edición interactiva
remota usa la ventana transmitida (Selkies, Sunshine) o no se ofrece. Lo que no cabe se marca «próximamente» con el motivo.

## 5. Rare: juegos en servidores propios o compartidos

### 5.1 Tres rutas, de más a menos simple

| Ruta | Dónde corre | Cómo se usa | Estado |
|---|---|---|---|
| **A. Neurona propia con pantalla** | Mac, Windows o Linux de la persona | Rare nativo; el OS pide abrirlo con `pedirLanzamiento("rare", …)` (se añade a `BINARIOS_PERMITIDOS`) y **una persona confirma** | Cableable ya |
| **B. Servidor propio** | Linux x86_64 con GPU (una neurona de la malla o un servidor de la persona), usuario/contenedor dedicado, Wine o Proton | Rare + display virtual; la ventana llega por **Selkies** (MPL-2.0, ya previsto en `apps-en-la-malla` §9) o **Sunshine/Moonlight** (GPL; programa aparte). Modo `transmitida` | Diseñado; sin cablear |
| **C. Servidor compartido** (grupo o comunidad) | Igual que B, **una sesión aislada por persona** | Cada persona entra con **su** cuenta de Epic en **su** sesión; cuota de tiempo y de disco por persona | Diseñado; **espera la palabra de Alex** (§8) |

El **A1** de Oracle (2 OCPU, 12 GB, sin GPU) **no sirve** para juegos 3D; sí para el lanzador ligero o juegos 2D. Los juegos pesan
decenas de GB y viven en el disco del anfitrión: no son un volumen «montado» de la malla.

### 5.2 Qué hace el OS y qué no

- Hace: ficha en la Biblioteca (§6), `rare` en la lista blanca de `pedirLanzamiento`, planificador puro
  `planificarJuegoPc(neurona, servidores)` que dice qué ruta cabe y por qué, y la guarda de credenciales (§5.3)
  (tarea ART1025L). La entrada visible «Juegos de PC» junto a `/juego` queda para una ola de interfaz posterior.
- No hace: no incrusta Rare, no ejecuta `legendary` por un agente, no guarda sesiones de Epic, no
  comparte cuentas, no redistribuye juegos ni los «instala por ti». El juego lo instala la persona desde su sesión.
- Sunshine/Moonlight exigen su propio emparejamiento por PIN: lo hace la persona, no el OS.

### 5.3 Credenciales de Epic (regla dura)

- Son **de la persona**: cada persona se identifica en **su** ventana de Rare o con `rare login` en **su** sesión; el OS nunca recibe
  el código de autorización ni el `user.json`.
- Carpeta de configuración por persona: `LEGENDARY_CONFIG_PATH=<datos>/juegos/<persona>/legendary` con permisos `0700`, **fuera** de cualquier
  carpeta sincronizada (Syncthing, Drive), de los volúmenes de la malla y de `starseed_memory_root/`.
- Una guarda (`validarSinCredencialesEpic(texto)`) rechaza en memorias, salas, publicaciones, registros y commits los campos típicos de
  `user.json` (`access_token`, `refresh_token`, `account_id`, `displayName` junto con un token…).
- Bloquear (o alojar con SHA fijado) `workarounds.json`, `steam_appids.json.xz` y el ejecutable «wrapper» que Rare descarga.
- Sin juegos de terceros dentro del repo ni de la Biblioteca; solo la ficha de Rare y las instrucciones.

## 6. Biblioteca y actualizaciones

- Las cuatro fichas viven en el **catálogo de la Protomolécula**, que ya alimenta la Biblioteca (no se duplican en
  `packages.ts`) y la comprobación `/api/library/actualizaciones` (`fuentesProtomolecula()`): FigCraft, GridCraft y
  DeckCraft por `github-releases`; Rare por `github-tags` con filtro `^\d+\.\d+\.\d+\.\d+$` (sus releases son
  todas preliminares y `releases/latest` no las ve).
- El guion `scripts/protomolecula/actualizar_catalogo.py` deja en `config/protomolecula-versiones.json` solo las
  diferencias. Una versión nueva **no se instala ni se aloja sola**: antes pasa por la tarea de huellas (ART1025M) y la
  palabra de Alex.
- Cada activo que el OS aloje (los zips web) se fija por su `SHA256SUMS.txt` y se verifica antes de servirse como origen aparte.
- Prueba existente actualizada: `catalogo-herramientas.test.ts` (diez apps de ArtCraft, notas de la pasarela, Rare como programa aparte).
  El test `scripts/protomolecula/test_actualizar_catalogo.py::test_el_catalogo_real_se_lee_entero` **ya fallaba antes** de esta
  ola (245 ≠ 244, por `pixelartistry-watertight`); no es de esta ola.

## 7. Cola `ART1025B…M` (`starseed_memory_root/olas/cola-artcraft-1025.json`)

Doce tareas validadas con `validarCola` (nombre de cola `artcraft-1025`, sin avisos). Cada una toca ≤ 3 archivos y ≤ 120 líneas por
archivo, con prompt autosuficiente que cita este contrato y repite las reglas comunes. La carpeta `starseed_memory_root/` no se versiona:
el archivo se añadió con `git add -f` y sus ids (`ART1025*`) no están en ninguna otra cola viva. Orden por dependencias:

| Id | Tarea | Depende |
|---|---|---|
| ART1025B | Política de la pasarela ArtCraft (pura): lista permitida, rutas y parámetros (§3.2) | — |
| ART1025C | Cliente MCP por stdio con límites (puro, transporte inyectado) | — |
| ART1025D | Pasarela en servidor: `<app>-cli mcp` sin shell, sin red y con raíces por neurona, y su ruta `/api/artcraft/[app]` | B, C |
| ART1025E | `elegirMedioArtcraft`: nativo, web o servidor de la malla, con motivo (§4.5) | B |
| ART1025F | Acción de agente `[[ACCION: artcraft …]]` en Aurora (§4.1) | B, D |
| ART1025G | Taller del agente: tres recursos MCP de ArtCraft (§4.1) | B |
| ART1025H | Átomos de la Protomolécula para FigCraft, GridCraft y DeckCraft, build web aislado (§4.2) | E |
| ART1025I | GridCraft ↔ tabla viva: CSV, rangos y plan de llamadas (§4.2) | B |
| ART1025J | DeckCraft ↔ presentación viva y exportes para publicaciones (§4.3) | B |
| ART1025K | FigCraft → `UiSpec`: diseños con nombre `ss:*` a apps y widgets seguros (§4.4) | B |
| ART1025L | Rare: «Juegos de PC», lanzamiento confirmado y guarda de credenciales de Epic (§5) | — |
| ART1025M | Huellas SHA256 de los activos de ArtCraft y Rare (§6) | — |

Fuera de la cola, a propósito: instalar o compilar las apps (lo decide Alex, §8), alojar los zips web como origen aparte, el cableado
de la ruta B/C de Rare (transmisión) y la **importación** de un `.pptx` o `.xlsx` de fuera a las apps vivas (hoy se abre en DeckCraft o
GridCraft y se publica desde ahí). La verificación de punta a punta (Biblioteca con las cuatro fichas, comprobación de versiones,
Protomolécula, y un documento real de FigCraft para confirmar los campos de `inspect_document`) la hace Claude en la Mac tras integrar.

## 8. Lo que necesita la palabra de Alex

1. **Condiciones de Epic** para cuentas en servidores compartidos (una cuenta por persona; sesiones transmitidas).
2. **`collab.*` de FigCraft**: dejarlo vetado (recomendado) o permitirlo solo contra un `figcraft-server` propio. El servidor público
   `collab.craftapps.dev` recibe los archivos sin cifrar de extremo a extremo.
3. **Descargas remotas de Rare** (`workarounds`, `steam_appids`, wrapper): bloquear (recomendado) o alojar con SHA fijado.
4. **Transmisión** (Sunshine o Selkies) en una neurona con GPU: cuál y dónde.
5. **Instalar algo en la Mac** (poco disco): guía y tamaños en `instalar-mac.md`; solo las CLI cuestan ~155 MB comprimidas.
6. **Fijar versiones por SHA** y alojar los zips web como origen aparte.
7. **Publicar y empujar**: esta ola solo deja un commit local.

## 9. Límites de esta revisión (no comprobado)

- No se ejecutó ni compiló nada de los cuatro proyectos; no se midió tráfico de red ni se probó una sola herramienta MCP.
- No hay CLI suelto de Linux en las releases (§2.6) y no se descargó ningún binario.
- La API de GitHub (`gh api …/releases`) estuvo denegada en esta sesión: versiones, fechas y tamaños salen de las páginas web de
  releases, que mostraron al principio datos viejos (FigCraft 0.5.1) hasta pedir `releases/latest` y `expanded_assets/<etiqueta>`.
- Las licencias de las dependencias, la firma real de los binarios de macOS y la fidelidad de `.pptx`/`.xlsx`/`.fig` de fuera no se verificaron.
- Los comandos de `sandbox-exec` y `unshare -n` están sin probar en estas máquinas.
