# Repos de la Librería · contrato de la tanda 1026 (Ola 1025U · REP1026 · 2026-10-26)

> Petición de Alex (2026-10-26): integrar en la Librería **Autom8AI/Open-Higgsfield-AI** (contenido audiovisual gratuito para StarSeed OS), **Tencent/WeKnora** (que Astraura conozca y entienda todo en cada contexto y medio), **opf/openproject** (desarrollo de proyectos en la red y en Astraura) y **capsoftware/cap** (habilidades donde encaje). Regla de fondo (2026-10-25, literal): «absolutamente todas las repos y habilidades deben ser integradas en la librería preinstaladas y autoactualizadas».
> Este documento es la fuente de verdad de la tanda. Sigue el formato de `architecture/repos-libreria-1025.md` (misma mecánica de fichas, siembra y comprobación de versión) y no repite lo que allí ya está escrito.

Nada de lo que describe se ha publicado ni se ha empujado, y no se ejecutó código de ningún repo de terceros ni se instaló nada en la Mac ni en el A1: solo se leyeron README, LICENSE, manifiestos, documentación de API y páginas de precios, y se leyó el historial de una copia en un clon parcial sin archivos. Lo escrito dentro de esos repos se trató como dato, nunca como instrucciones. **Ninguno de los cuatro corre hoy en las máquinas de Alex**: las fichas lo dicen (`corre_aqui: false`) y los conectores se probaron solo con respuestas simuladas.

## 0. En una pantalla

- **5 fichas** en `config/repos-libreria-1026.json`: **4 nuevas** en la Biblioteca (`lib-open-higgsfield-ai`, `lib-weknora`, `lib-openproject`, `lib-cap`) y **1 fusionada** con una ficha que ya existía (`iatool-open-generative-ai`, que se actualiza en su sitio en lugar de duplicarse).
- **Hallazgo principal**: Autom8AI/Open-Higgsfield-AI **no es el proyecto original**. Es una bifurcación de abril de 2026 que cambió el motor por servicios de pago y le puso una puerta de acceso por PIN (§2). Lo gratuito y local que Alex busca está en el proyecto original, hoy **Open Generative AI v2.0.0**, que ya estaba en el catálogo y ahora lleva su versión real, su canal y un texto corregido.
- **Todas «siempre»**: se siembran en la `SEED_VERSION` **18**. Instalar una ficha solo registra su enlace (cero descarga, cero ejecución, cero clave).
- **Autoactualizadas**: `/api/library/actualizaciones` comprueba las cinco (§7).
- **Dos conectores de solo lectura** (WeKnora y OpenProject) sobre un núcleo común, **una habilidad por repo** para Aurora (Cap, WeKnora, OpenProject) y **un evento** con nombre propio que abre la sección Grabar del Centro de Control (§4 y §5).
- **5 decisiones** para Alex en el apartado 9.

### Las fichas

| Ficha | Repo | Licencia | Versión · fecha | Canal | Gratis | Corre aquí |
|---|---|---|---|---|---|---|
| `lib-open-higgsfield-ai` | Autom8AI/Open-Higgsfield-AI | MIT solo en su README (el repo no trae LICENSE) | commit d32d022 · 2026-10-25 | commits | no (kie.ai y fal.ai de pago) | no |
| `iatool-open-generative-ai` (fusiona `lib-open-generative-ai`) | Anil-matcha/Open-Generative-AI | MIT | v2.0.0 · 2026-05-23 | releases | no (lo local sí; la nube Muapi es de pago) | no |
| `lib-weknora` | Tencent/WeKnora | MIT | v0.8.3 · 2026-10-14 | releases | sí (los modelos van por Ollama o una API compatible con OpenAI) | no |
| `lib-openproject` | opf/openproject | GPL-3.0 (Community; los complementos Enterprise son de pago) | v17.9.3 · 2026-10-22 | tags `^v\d+\.\d+\.\d+$` | sí | no |
| `lib-cap` | CapSoftware/Cap | AGPL-3.0 (crates cap-camera* y scap-* en MIT); binarios gratis para uso personal, de pago para uso comercial | cap-v0.6.1 · 2026-10-20 | tags `^cap-v\d+\.\d+\.\d+$` | sí (personal) | no |

La marca «Gratis» sale de `free`. Se puso `false` en las dos fichas de contenido audiovisual a propósito: el código es libre, pero lo que genera depende de servicios de pago o de una máquina que Alex no tiene; decirlo es parte de la ficha.

## 1. Cómo llegan a la Librería

**Datos.** `config/repos-libreria-1026.json`: las cinco fichas con el formato de `repos-libreria-1025.json`, más `fusionadas`, `duplicadas` (qué se decidió con cada nombre y por qué), `decisiones` y `licencias_verificadas` (qué se leyó, de dónde y cuándo).

**Módulo.** `src/lib/library/repos-1026.ts` es **puro**: sin `"use client"` y sin `node:*`, con el JSON por importación estática (trampa 11 de `CLAUDE.md`). Reutiliza `resumenRequisitos` y `autorDe` de `repos-1025.ts` (por eso ahora se exportan). Exporta `FICHAS_REPOS_1026` (las 4 nuevas, tipo `project`, con `payload.upstream`, `externalUrl`, `canal`, `patronTag`, `licencia`, `requisitos`, `corre_aqui`, `nota`, `aviso`), `conSeguimiento1026` y `FICHAS_VIEJAS_SEGUIMIENTO_1026` (la ficha fusionada con su versión, su repo y su texto nuevo), `IDS_SIEMBRA_1026` y las tablas de decisiones y licencias.

**Lo que la tienda enseña.** Solo el nombre y la descripción. Por eso lo que una persona debe saber antes de fiarse (de pago, licencia, medio que no existe) va en `nota`, que se une a la descripción de la ficha.

**Catálogo.** `packages.ts` reparte `FICHAS_REPOS_1026` en `starseed-labs` y pasa `starseed-ia-tools` por `conSeguimiento1026` (después de `conSeguimiento1025`).

**Siembra.** `defaults-seed.ts` sube a `SEED_VERSION = 18` y suma `IDS_SIEMBRA_1026` a `RECOMMENDED_PACKAGE_IDS` (unión de conjuntos: ningún id se instala dos veces). Quien desinstale una ficha no la ve volver. **Posible conflicto de unión**: otra tarea de la misma ola puede haber subido también `SEED_VERSION`; al integrar, se queda el mayor y se mantienen las dos listas.

**Sin `comingSoon`.** La tanda sigue la convención de la 1025: la ficha se instala (guarda el enlace) y dice con claridad que no corre aquí. `comingSoon` bloquearía la instalación y la siembra; se descartó para no esconder fichas que sí queremos preinstaladas. Es una de las dudas del informe.

## 2. Autom8AI/Open-Higgsfield-AI · por qué no sirve tal cual

Lo comprobado el 2026-10-26 sobre un clon parcial (sin archivos) de la copia y el README, el `package.json` y los archivos de funciones leídos en el remoto:

- Es una **bifurcación** del proyecto de Anil-matcha (punto común `b578108`, 2026-04-09) con **12 commits propios** de un solo autor, del 2026-10-18 al 2026-10-25 (el último, `d32d022`).
- Esos commits **sustituyen Muapi por kie.ai y fal.ai** (funciones `_fal-generation.js`, `fal-callback.js`, `_fal.js`), añaden **funciones y borde de Netlify** (`netlify.toml`, `edge-functions`), guardan datos en **Airtable a través de Composio** y ponen una **puerta de acceso por nombre, PIN y captcha** (`_auth.js`, sesión `matai_session`, identificadores de base fijos en el código) delante de una app renombrada **MATAI**.
- **Licencia**: el README dice MIT, pero el repo no trae archivo `LICENSE` (el original añadió el suyo el 2026-06-12, después de la bifurcación). Se ficha como «MIT solo en su README».
- Consecuencia: **no genera contenido gratis** (todo pasa por servicios de pago) y **no arranca sin su backend ni su acceso**. Se ficha tal como Alex la pidió, con ese aviso a la vista, para que nadie la despliegue creyendo que es gratuita.

**Lo gratuito está en el original.** Anil-matcha/Open-Generative-AI (antes Open-Higgsfield-AI), licencia MIT con su `LICENSE`, **v2.0.0** (2026-05-23): estudio de imagen, vídeo, audio, sincronía labial y cine con más de 600 modelos en la nube **de pago** (pasarela Muapi.ai, con la clave del propio usuario) y, desde la versión 2, **dos motores locales sin clave**: stable-diffusion.cpp (incluido; SD 1.5, SDXL y Z-Image; Metal en Apple Silicon, CUDA, Vulkan o ROCm) y Wan2GP (aparte; GPU NVIDIA o AMD; Wan, Hunyuan, LTX-2, Flux y Qwen-Image; también por MCP desde otra máquina). Requisitos honestos para Alex:

| Medio | Qué cabe |
|---|---|
| Mac de 8 GB | Solo imagen con Stable Diffusion 1.5 (su README avisa de que Z-Image la cuelga y recomienda 16 GB); Wan2GP no tiene camino en Apple Silicon |
| A1 (2 OCPU, 12 GB, sin GPU, disco al 95 %) | Nada; no se instala ahí |
| Una máquina con GPU NVIDIA o AMD | Wan2GP para vídeo |

El motor por defecto de Astraura para contenido gratuito sigue siendo **Pollinations** (sin clave). Avisos de la ficha: la app de escritorio no está notarizada en macOS (hay que quitar la cuarentena a mano), los pesos locales pesan de 2 a 7 GB, y el proyecto se anuncia «sin filtros de contenido»: lo que se publique desde StarSeed pasa por la moderación del OS. **Qué hace el OS hoy con ella: nada.** Es un enlace.

## 3. Tencent/WeKnora · conocimiento de cada contexto

- **Qué es.** Marco de conocimiento con IA (Go y Vue). Reúne documentos (PDF, Word, Excel, imágenes y más de 10 formatos; sincronía con Notion, Feishu, Confluence, GitLab), los busca con recuperación híbrida y **citas al pasaje original**, razona con un agente de varios pasos (habilidades, MCP, entorno aislado) y los organiza como wiki con grafo. Trae API `/api/v1` con claves por capacidades, un servidor MCP propio (`/mcp/<endpoint>`) y un modo Lite de un binario con SQLite.
- **Licencia.** MIT (Copyright 2026 Tencent; los componentes de terceros de su LICENSE conservan la suya). Versión v0.8.3 (2026-10-14).
- **Requisitos** (documentación de instalación, 2026-10-26): Docker 20.10+ y Compose v2, **4 núcleos y 8 GB** para empezar, sin contar los pesos de Ollama; ParadeDB/PostgreSQL y Redis; el modo Lite se compila con Go 1.26, Node.js y Python 3.10 (sin instalador publicado); la imagen de ParadeDB en ARM no está garantizada. Su guía pide red privada y no exponerlo a internet.
- **Gratis o de pago.** Código MIT. Los modelos van por Ollama (local) o por cualquier API compatible con OpenAI; con una API de pago, el gasto es el de esa API. WeKnora no cobra nada por sí mismo.
- **Cómo encaja.** Astraura conocería los documentos de un grupo, una comunidad o un proyecto y respondería citando de dónde sale cada dato, sin depender de la memoria de un modelo, en cualquier medio (chat, voz, páginas). Debe respetar el alcance de memoria del OS (personal › perfil › grupo › pública, nunca al revés): **lo personal no va a una base de grupo ni pública**. Es el hueco que no cubren RAGFlow, AnythingLLM ni Open Notebook (ya en la Librería): otros motores, otros límites.
- **Hoy.** No hay instancia ni dónde alojarla (el A1 tiene el disco al 95 % y 2 núcleos). Existe el conector de §4.1; falta decidir el servidor y cablear el alcance de memoria de cada contexto.

## 4. Los conectores de solo lectura

Patrón de `src/lib/servidores/coolify.ts`, factorizado en un núcleo compartido para no copiar la misma lógica tres veces.

**Núcleo `src/lib/servidores/lectura-http.ts`** (puro, sin `node:*`). Todo lo que hace una lectura segura vive aquí:
- `fetch` y reloj **inyectados** (las pruebas no tocan la red ni el tiempo);
- `redirect: "manual"` (una redirección es un fallo, no se sigue a otro anfitrión con la clave puesta);
- **solo GET** y, donde la API documentada lo exige para buscar, un POST sin efectos (la búsqueda de WeKnora);
- tope de tiempo (15 s; 6 s para sondear) y tope de tamaño de la respuesta (2.000.000 de caracteres);
- **URL y clave por el NOMBRE de su variable de entorno**, nunca el valor en el repo; la URL debe ser `http(s)` con servidor y **sin usuario ni contraseña incrustados**, y la clave, texto ASCII visible sin espacios (no se fuerza `https`: una instancia en red privada puede ir en `http`, y es una decisión de quien la monta);
- los errores **no contienen la clave** (se enmascara aunque el servidor la repita) y se clasifican en `credenciales | peticion | tiempo | red | http | datos`, con un mensaje en español que dice qué hacer.

### 4.1 WeKnora · `src/lib/conocimiento/weknora.ts`

Solo rutas **documentadas** en el repositorio (`docs/swagger.json`, `website-docs/04-api`, 2026-10-26):

| Función | Ruta | Para qué |
|---|---|---|
| `sondear` | `GET {url}/health` (sin autenticación) | ¿está viva la instancia? |
| `listarBases` | `GET {url}/api/v1/knowledge-bases` | qué bases de conocimiento hay |
| `buscar` | `POST {url}/api/v1/knowledge-search` | fragmentos con su documento de origen, **sin sesión ni resumen con LLM** (el «interfaz preferido para sistemas externos») |

Autenticación: cabecera `X-API-Key`; basta una clave limitada a la capacidad **`retrieve`** y es lo recomendable. Variables: `WEKNORA_URL` y `WEKNORA_API_KEY`. **Decisiones**: no se usa el chat de preguntas y respuestas (crea sesiones y gasta tokens de la instancia: eso no es lectura); `buscar` exige **al menos una base** (la documentación solo describe la búsqueda acotada) y recorta consulta, bases (10), límite (1 a 20, por defecto 5) y contenido de cada fragmento (2.000 caracteres).

### 4.2 OpenProject · `src/lib/proyectos/openproject.ts`

API v3 (HAL+JSON; `docs/api/apiv3`, 2026-10-26):

| Función | Ruta | Para qué |
|---|---|---|
| `sondear` | `GET {url}/api/v3` | raíz de la API: nombre de la instancia y, si la cuenta es administradora, su versión |
| `listarProyectos` | `GET {url}/api/v3/projects` | proyectos que el token puede ver, con paginación (`offset` es número de página, `pageSize`) |
| `listarPaquetes` | `GET {url}/api/v3/work_packages` | paquetes de trabajo; `filters` como JSON (`[]` si ninguno), el filtro `project` si se pide uno y, salvo `incluirCerrados`, el de estado abierto (`status_id` con operador `o`). La ruta antigua `/projects/{id}/work_packages` está obsoleta y no se usa |

Autenticación: el token de API de la cuenta como **Basic con usuario `apikey`** (o `Bearer`). Variables: `OPENPROJECT_URL` y `OPENPROJECT_API_KEY`. **Decisiones**: filtros solo con las opciones documentadas; el filtro `active` de proyectos no se usa en el servidor (`soloActivos` filtra después, en el cliente) para no depender de un operador no probado; el paquete devuelve solo lo que una persona necesita ver (asunto, tipo, estado, prioridad, asignado, fechas, porcentaje) y recorta la descripción a 500 caracteres.

**Límites honestos de los dos**: probados únicamente con respuestas simuladas escritas desde la documentación; ninguna instancia real los ha ejercitado; ninguna herramienta de Aurora los invoca todavía (el registro `src/lib/integrations/aurora-tools.ts` no se tocó a propósito: son 2.094 líneas de otras tareas) y no escriben nada en WeKnora ni en OpenProject.

## 5. Habilidades de Astraura

`src/ai/astraura/habilidades/repos-1026.ts` (puro; solo importa un tipo del manifiesto) define tres habilidades en el estilo de `src/ai/astraura/skills.ts`: **tarjeta ≤ 60 palabras** (Needle y BitNet) y **resumen ≤ 120 palabras** (cerebro de Aurora, `systemPrompt`). Entran en `SKILL_CAPABILITIES` con `packageIds: [<ficha>]`, así que **se activan al instalar la ficha y se apagan al desinstalarla**, y sus ids se añadieron a `CAPACIDADES_CONOCIDAS` de `agentes-grupo.ts` (copia a mano del vocabulario) para que los agentes de grupo puedan llevarlas.

| Habilidad | Ficha | Qué hace | Qué NO hace hoy |
|---|---|---|---|
| `grabar-pantalla` | `lib-cap` | «Grabar la pantalla»: pide abrir la sección Grabar del Centro de Control (tutoriales del OS, demostraciones de la red, de Astraura o de la Protomolécula, pasos de un fallo) | No graba, no instala Cap, y ninguna herramienta de Aurora la invoca todavía |
| `conocimiento-weknora` | `lib-weknora` | Explica qué sería y qué hace falta (servidor aparte, `WEKNORA_URL`, `WEKNORA_API_KEY`) | No hay instancia ni herramienta que consulte el conector: el modelo **no debe fingir consultar ni inventar citas** |
| `proyectos-openproject` | `lib-openproject` | Igual para proyectos y tareas; Vikunja para tareas ligeras | Ídem: **no inventar tareas** |

### 5.1 El evento «abrir Grabar» · `src/lib/habilidades/grabar-pantalla.ts`

La sección Grabar del Centro de Control la construye **otra tarea de la ola** (V2). Las dos partes solo se hablan por un evento de la ventana, para que ninguna importe a la otra:

- **`starseed:abrir-grabar`** es un `CustomEvent` **cancelable** con `detail: { origen, motivo }` (texto limpio, 40 y 200 caracteres como máximo).
- **Quien pide** llama a `abrirGrabar({ origen?, motivo? })`. Devuelve la verdad: `abierto: true` **solo si un oyente reclamó el evento** con `preventDefault()`; si nadie lo reclama, `abierto: false` con `razon: "sin-oyente"` y un mensaje que lo dice («no se ha abierto nada, ábrela a mano desde el Centro de Control»). Sin ventana (servidor), `razon: "sin-ventana"`. No lanza nunca.
- **Quien abre** llama a `escucharAbrirGrabar((detalle) => …)`, que reclama el evento y devuelve la función para desapuntarse.
- El evento **solo abre**: grabar lo decide una persona con su dedo y el navegador pide su permiso de captura. La habilidad nunca graba por su cuenta (la prueba pura comprueba que el módulo no contiene `getDisplayMedia` ni `MediaRecorder`).

**Para que surta efecto falta una línea de V2 o del orquestador**: en el componente de la sección Grabar, un `useEffect` con `return escucharAbrirGrabar(() => seleccionarSeccionGrabar())`. Hoy **nadie escucha**, y las pruebas dejan constancia de que en ese caso el mensaje es honesto. Tampoco hay todavía quien llame a `abrirGrabar` (una acción de `src/lib/aurora/actions.ts` o un botón): también es un contrato, no un cableado.

### 5.2 Cap, la ficha y la licencia

Cap (CapSoftware/Cap, escrito «capsoftware/cap» en la petición; GitHub no distingue mayúsculas) es un grabador de pantalla de código abierto (Rust y TypeScript): modo instantáneo (enlace al terminar) y modo estudio (grabación local con editor, exportación a MP4, GIF y MOV hasta 4K a 60 fps). Para agentes trae la orden **`cap`** (`cap record start|stop`, salida JSON) y un servidor MCP local (`cap mcp serve`); variables `CAP_API_KEY` y `CAP_SERVER_URL` del propio Cap. Es el **motor opcional de escritorio** (la Mac) de la sección Grabar propia del OS, no su sustituto.

**Licencia y lo que exige** (cap.so/pricing y cap.so/docs/commercial-license, 2026-10-26):
- Código **AGPL-3.0**, con los crates `cap-camera*` y `scap-*` en MIT. Si el OS enlazara o sirviera código de Cap, la AGPL obligaría a abrir el código del conjunto; por eso **solo se habla con él por su CLI o su MCP, como programa aparte**, y no se copió ninguna línea.
- La **aplicación de escritorio de cap.so** es **gratuita para uso personal** (sin límite de tiempo en grabaciones locales); el **uso comercial** de sus binarios pide una **licencia de pago de escritorio (29 USD por licencia y año)**. Esa licencia no aplica a lo que se compile del código. Grabar para promocionar algo que da ingresos (el café, un curso) es uso comercial. La nube de Cap (enlaces compartidos largos, IA, equipos) también es de pago.
- Requisitos: macOS 13.1+ (Apple Silicon e Intel), Windows, Linux con glibc 2.39 o más (Ubuntu 24.04+). `cap upload` sube a cap.so salvo que se apunte a un servidor propio con `CAP_SERVER_URL`. En el A1 no tiene sentido (sin pantalla ni disco para autoalojar la web).
- Nadie lo instala en nombre de la persona (nada de `curl | sh`): la persona lo baja de cap.so/download.

## 6. OpenProject · el repo

- **Qué es.** Gestión de proyectos (Ruby on Rails y Angular, PostgreSQL): proyectos y carteras, paquetes de trabajo, tableros Kanban y ágiles, Gantt, hitos, hojas de tiempo y costes, wikis, foros, reuniones. API v3 (HAL+JSON, OpenAPI 3.1), servidor MCP y SCIM.
- **Licencia.** **GPL-3.0** (deriva de ChiliProject y Redmine, GPL-2.0 o posterior). La edición Community es gratuita; los complementos **Enterprise** y su nube (prueba de 14 días) son de pago. Al ser GPL-3.0 **corre como programa aparte**, nunca dentro del OS ni enlazado.
- **Requisitos** (rama dev, 2026-10-26): 4 núcleos, 4 GB de memoria y 20 GB libres hasta 200 usuarios; PostgreSQL 16 o superior; Docker (todo en uno o Compose), Helm o paquetes; ARM sin comprobar. El A1 no cabe (2 núcleos, disco al 95 %).
- **Cómo encaja.** Un sitio común y soberano donde los grupos, las comunidades y los agentes de la red y de Astraura planifican proyectos de cualquier tipo. **No sustituye a Vikunja** (`lib-vikunja`, tanda 1020b): Vikunja son tareas por grupo con poca memoria; OpenProject es la suite completa. Se complementan, y cuál alojar primero es de Alex.

## 7. Autoactualización · canal de cada ficha y sus límites

`/api/library/actualizaciones` incluye `FICHAS_REPOS_1026` y `FICHAS_VIEJAS_SEGUIMIENTO_1026`:

| Ficha | Canal | Qué se lee |
|---|---|---|
| `lib-open-higgsfield-ai` | commits | SHA corto de 7 caracteres → «igual» o «hay-actualizacion» |
| `iatool-open-generative-ai` | releases | última versión publicada (v2.0.0) y su fecha |
| `lib-weknora` | releases | última versión publicada (v0.8.3) y su fecha |
| `lib-openproject` | tags con `patronTag` | `/tags?per_page=100` filtrado por `^v\d+\.\d+\.\d+$` |
| `lib-cap` | tags con `patronTag` | ídem, `^cap-v\d+\.\d+\.\d+$` |

Límites heredados de la 1025, **no resueltos aquí**: `compararVersiones` solo entiende SHA, así que en `releases` y `tags` la ruta devuelve la versión publicada pero el estado queda «desconocida» (tarea LIB1025B); y el canal `tags` lee **solo la primera página** (100 etiquetas): OpenProject tiene 371 y Cap 199, así que si en esas 100 no aparece ninguna de versión (las nocturnas de Cap, las de sprint de OpenProject), la ficha dice «desconocida» y no inventa nada. Está escrito en el `aviso` de cada una.

## 8. Cómo se comprobó

- **Pruebas puras** (sin red, sin disco real, sin reloj; 99 casos en archivos nuevos y la prueba de siembra ya existente, ampliada):
  - `src/lib/library/__tests__/repos-1026.test.ts` (21): forma de las fichas, ids únicos, iconos dentro de `ICON_MAP`, licencias y requisitos honestos, `corre_aqui:false`, fusión sin duplicar, siembra, ruta de actualizaciones con `fetch` simulado, pureza del módulo, sin nombres prohibidos ni claves con forma real.
  - `src/lib/library/__tests__/defaults-seed.test.ts` (15 en total, ampliada con las de esta tanda): `SEED_VERSION` 18, las cuatro fichas nuevas y la vieja en la siembra, y que quien ya tenía la 17 recibe solo el delta.
  - `src/lib/servidores/__tests__/lectura-http.test.ts` (16): URL, credenciales, `redirect: "manual"`, tiempos y tamaños, enmascarado de la clave, clasificación de fallos.
  - `src/lib/conocimiento/__tests__/weknora.test.ts` (21) y `src/lib/proyectos/__tests__/openproject.test.ts` (20): rutas, cabeceras, formas HAL y `{success,data}`, paginación, límites, y los errores (sin credenciales, 401, 403, 404, 429, 5xx, tiempo agotado, red caída, redirección, JSON inválido, respuesta enorme).
  - `src/lib/habilidades/__tests__/grabar-pantalla.test.ts` (10): el contrato del evento, con y sin oyente.
  - `src/ai/astraura/habilidades/__tests__/repos-1026.test.ts` (11): límites de palabras (60 y 120), activación al instalar la ficha, vocabulario de agentes de grupo, textos honestos.
- **Guardias existentes que siguen verdes**: `nombre-genesis`, `agentes-grupo`, `fundamento-registro`, `medios-os`, `habilidades-agente`, `actualizaciones` y el resto de `src/lib/library/__tests__`.
- **tsc**: `flock … npx tsc --noEmit -p tsconfig.json` (ver el parte del commit).
- **Claves**: las pruebas montan sus claves de ejemplo en tiempo de ejecución; ni el repo ni este documento llevan ninguna. El escáner de secretos sobre el diff completo debe dar `[]`.
- **No se hizo** (y no se finge): ninguna instancia real de WeKnora, OpenProject ni Cap; ninguna descarga; ninguna lectura de sus APIs reales; `next build` (lo prohíbe el enjambre vivo; la pureza de los módulos se comprueba con pruebas que leen el código).

## 9. Decisiones que esperan a Alex

1. **Contenido audiovisual gratuito.** La copia de Autom8AI (MATAI) usa kie.ai y fal.ai de pago y una puerta por PIN: no sirve. ¿Quieres que el OS conecte el original (Open Generative AI v2.0.0) como motor local de imagen en la Mac (solo SD 1.5) y Wan2GP por MCP en una máquina con GPU? Hoy no hay nada cableado.
2. **Cap y la licencia.** El uso comercial de sus binarios pide 29 USD al año. ¿Se grabarán demostraciones del café o de Audiomorphic con él? Si sí, hay que comprar la licencia o compilarlo del código; para tutoriales del OS sin ingresos basta la gratuita. Y si el OS usará su CLI y su MCP local (`cap mcp serve`) o solo el grabador propio de la sección Grabar.
3. **Dónde alojar WeKnora y OpenProject.** Ninguno cabe en el A1 hoy (2 núcleos, disco al 95 %): WeKnora pide 4 núcleos y 8 GB, OpenProject 4 núcleos y 4 GB. Opciones: liberar el A1, otro servidor del plan gratuito de Oracle, o la Mac cuando el enjambre no escriba. Mientras tanto, Vikunja cubre tareas ligeras.
4. **Variables de entorno.** Cuando haya instancias: `WEKNORA_URL`, `WEKNORA_API_KEY`, `OPENPROJECT_URL` y `OPENPROJECT_API_KEY` en el entorno del servidor que llame (nunca en el repo). Una clave de WeKnora limitada a `retrieve`; un token de OpenProject de una cuenta con permisos de solo lectura.
5. **Cableado pendiente.** (a) Que la sección Grabar (V2) escuche `starseed:abrir-grabar`; (b) una acción de Aurora o un botón que llame a `abrirGrabar`; (c) herramientas de Aurora que usen los dos conectores. Mientras no existan, las habilidades dicen la verdad: no fingen.

## 10. Lo que no se pudo verificar

- La API de GitHub y las páginas de lanzamientos no estaban disponibles desde el contenedor: las versiones se leyeron con `git ls-remote` y los archivos del repo. Los números de estrellas y de etiquetas son los de esa lectura.
- El historial de la copia de Autom8AI se leyó en un clon parcial sin blobs; las funciones y la puerta por PIN se comprobaron con búsquedas en el árbol, sin ejecutar nada.
- Las rutas de los conectores salen de la documentación (swagger, OpenAPI y guías de cada proyecto), no de una instancia viva: un cambio de versión puede desmentirlas.
