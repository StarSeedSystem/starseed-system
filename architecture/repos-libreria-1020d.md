# 4.ª tanda: 10 repos — imagen con flujos, servidores, agentes, traducción, archivo, envíos y PDF (Ola 1020U)

Petición de Alex (2026-10-20, noche): ComfyUI para la generación de imágenes de Astraura, la Protomolécula, las
publicaciones y los mensajes, con sus flujos; Coolify para los servidores locales de todo tipo; OpenHands y
Harness² para los agentes de todo tipo; LibreTranslate para traducir con Astraura y cualquier agente, con clic
derecho en los textos y la página entera, en todos los sistemas de cada perfil; ArchiveBox para la administración
de los archivos de las bibliotecas; LocalSend para los envíos de archivos de cualquier formato por la malla local
P2P, las capas de conciencia colectiva y los servidores StarSeed; gallery-dl «para guardar, replicar, duplicar y
compartir entornos completos»; Stirling-PDF para editar PDF desde cualquier medio donde se abran; y OpenRig para los agentes. Y una regla
para toda la tanda: **lo que pide más capacidad (RAM, tarjeta gráfica) lo autoadministran la malla local y las
capas de conciencia de los servidores públicos, incluidos los de Oracle, Cloud Run y cualquier otro.** Catálogo
verificado: `config/repos-libreria-1020d.json`. Mismo contrato que las tandas 1020, 1020b y 1020c.

## 1. Lo que es de verdad y cómo entra

| Repo | Qué es | Licencia | Efecto | Preinstalar |
|---|---|---|---|---|
| Comfy-Org/ComfyUI | motor de difusión por nodos con API local de flujos | GPL-3.0 | conector + motor de imagen | siempre (ficha y conector) |
| coollabsio/coolify | despliegue autoalojado de apps, bases y 280+ servicios en tus servidores | Apache-2.0 | conector (solo lectura primero) | siempre (ficha y conector) |
| OpenHands/OpenHands | agentes de desarrollo en sandbox; Agent Server con API REST/WebSocket | MIT | conector | siempre (ficha y conector) |
| google-research/harness2 | investigación: mejorar el arnés de un agente sin tocar sus pesos | Apache-2.0 | catálogo (referencia) | siempre (ficha) |
| LibreTranslate/LibreTranslate | traducción autoalojada sin conexión (Argos Translate) | AGPL-3.0 | funcional en todo el OS | siempre (capa de traducción y conector) |
| ArchiveBox/ArchiveBox | archivo web: HTML, SingleFile, PDF, captura, WARC, medios, git | MIT | conector | siempre (ficha y conector) |
| localsend/localsend | envío de archivos por la red local, sin internet (protocolo abierto v2) | Apache-2.0 | funcional (transporte de la malla) | siempre (el protocolo es código del OS) |
| mikf/gallery-dl | descarga de galerías de imágenes de sitios web (CLI) | GPL-2.0 | herramienta de agentes | manual (credenciales y cookies) |
| Stirling-Tools/Stirling-PDF | edición de PDF con 50+ herramientas y API REST | MIT salvo carpetas con licencia propia | funcional (editor en todo medio) | siempre (ya sembrado) |
| mvschwarz/openrig | equipos persistentes de agentes de código (Claude Code, Codex) en tmux, con instantáneas | Apache-2.0 | herramienta de agentes | manual (toca la configuración de Claude y Codex) |

Ya estaban, sin duplicar (se comparan los repos sin distinguir mayúsculas, como GitHub): Coolify
(`iatool-coolify`), OpenHands (`iatool-openhands`, con la URL vieja `All-Hands-AI/OpenHands`), Stirling-PDF
(`iatool-stirling-pdf`, sembrado por defecto) y ComfyUI en la generación de imágenes, la Protomolécula, el servicio
local (8188) y el registro de integraciones (con la URL vieja `comfyanonymous/ComfyUI`; GitHub redirige, pero el
canal de versiones debe leer la canónica). No hay excluidas en esta tanda.

## 2. Decisiones honestas

- **ComfyUI no funcionaba de verdad.** `comfyuiImage` (`src/ai/astraura/media/media-gen.ts`) manda
  `{prompt: "texto"}` a `/prompt`; un ComfyUI real exige el GRAFO del flujo en formato API (nodos con
  `class_type` e `inputs`). Se arregla con plantillas de flujo puras (texto a imagen, imagen a imagen, escalado y
  variaciones, por formato de publicación 1:1, 4:5, 9:16 y 16:9) y un cliente que envía, sigue `/history/{id}`,
  baja por `/view` y devuelve los `node_errors` como texto legible. Los flujos son DATOS: se guardan, se comparten
  y se publican en la Biblioteca como cualquier entidad; nunca se instala un nodo personalizado de terceros sin
  revisar, porque ejecuta código.
- **Coolify en solo lectura primero.** Rutas verificadas el 2026-10-20: `GET /api/v1/teams/current` (sonda: de
  qué equipo es el token) y `GET /api/v1/servers`; autenticación `Authorization: Bearer <token>` con el valor
  entero (id|secreto); la API la enciende un administrador y puede llevar lista de IP. Desplegar, arrancar y parar
  servicios llegan cuando se verifiquen sus rutas exactas en la referencia: nada inventado. El instalador toma el
  servidor (Docker incluido): solo con la palabra de Alex, nunca en la Mac, y el panel nunca expuesto a internet.
- **OpenHands como medio de agentes, no como escritor del enjambre.** Su Agent Server existe (REST/WebSocket,
  cliente TypeScript en `OpenHands/software-agent-sdk`, MIT), pero sus rutas no se han verificado: hoy entra la
  ficha y el conector; el cliente, cuando se lea la referencia. Para escribir en el enjambre tendría que pasar la
  prueba de edición real con contexto de tamaño real, como cualquier escritor.
- **Harness² es una referencia, no un servicio.** Hace lo que el protocolo común de los agentes quiere hacer con
  pruebas: proponer cambios al arnés (prompt, barreras, memoria, herramientas, habilidades), probarlos y quedarse
  con lo que mejora; y su ejecutor por defecto es OpenCode, el mismo del enjambre. No se ejecuta con modelos:
  pide Vertex AI y la facturación de Google está desactivada desde el 2026-09-25; su red va sin restringir y Codex
  sin sandbox. La demo sin credenciales solo dentro de un sandbox con lista de dominios.
- **La traducción no saca lo privado.** Mensajes, documentos y memorias personales se traducen en el aparato, en
  neuronas de la misma cuenta o en servidores del cerebro; nunca en un servidor ajeno ni en la instancia pública de
  pago. AGPL-3.0: se usa tal cual.
- **ArchiveBox es la memoria de lo que se enlaza, no el gestor de archivos.** El Finder del OS administra los
  archivos; ArchiveBox guarda copia de cada fuente externa que cita una ficha de la Biblioteca, una publicación o
  un cerebro, para que nada se pierda cuando el enlace muera. Por defecto manda cada URL a archive.org: se apaga.
  Nunca archiva con cookies o sesiones de nadie en un servidor compartido.
- **LocalSend se habla, no se incrusta.** Su protocolo v2 (multidifusión 224.0.0.167:53317, `register`,
  `prepare-upload`, `upload`, `cancel`, PIN) entra como transporte de los envíos solo donde puede existir: la app
  nativa y los servidores (un navegador no escucha multidifusión ni abre un servidor HTTPS). Lo recibido pasa por
  el mismo motor de archivos de la malla (`src/lib/network/archivos-malla.ts`: oferta, hash, destino aparato,
  cerebro o Biblioteca). Fuera de la red local siguen WebRTC, el relé cifrado y los volúmenes por bandas. Su
  descarga «por navegador» va en HTTP sin cifrar: no se usa.
- **gallery-dl no guarda entornos.** Descarga galerías de imágenes de sitios web. Entra como herramienta para que
  cada persona traiga SUS galerías a su cerebro o a la Biblioteca, en su propia neurona (usa sus credenciales y
  cookies), respetando las condiciones de cada sitio. Su desarrollo se mudó a Codeberg: su canal de versiones
  pasa a Codeberg (GDL1020A). Lo que Alex pidió con él —guardar, replicar, duplicar y compartir entornos
  completos— lo hace el **paquete de sistema ampliado** (ENT1020A): escritorios, dock, widgets, apariencia, ajustes
  sincronizables y agentes saneados, más los volúmenes por bandas por referencia, con la misma revisión de
  invariantes y secretos antes de instalar.
- **Stirling-PDF ya estaba, pero solo como enlace.** La vista de archivos enseña un enlace a GitHub y el cliente
  solo une, pasa a imagen y saca texto. Ahora: el OS lee la descripción de API de la instancia y ofrece solo las
  operaciones que tiene (rotar, dividir, quitar y reordenar páginas, comprimir, OCR, marca de agua…), en todo
  medio donde se abra un PDF, y guarda el resultado como versión nueva. Solo la parte MIT.
- **OpenRig es para equipos de Claude Code y Codex, no para el enjambre.** Arranca equipos de agentes definidos en
  YAML dentro de tmux, los recupera tras un reinicio y los guarda y restaura enteros. Sirve para nosotros en Claude y
  como patrón para el relevo y la colmena de Genesis (equipo como datos, instantánea y restauración); el enjambre
  sigue escribiendo con modelos gratuitos. Toca `~/.claude.json`, `~/.codex/config.toml`, `~/.tmux.conf` y las
  habilidades, añade ganchos y da a Codex acceso total en sus puestos de núcleo: solo con la palabra de Alex, copia
  de seguridad antes, equipos con permisos estrechos y nunca sobre el repo principal con el enjambre escribiendo.

## 3. Lo pesado lo coloca la malla y las capas de conciencia (regla de Alex)

Cada paquete pesado declara `requisitos` (RAM, VRAM, GPU, Docker, arquitecturas verificadas, sistemas y de dónde
sale el dato; lo no medido va como «sin medir»). **Ninguna neurona lanza un servicio pesado por su cuenta:** pide
capacidad a la bolsa de recursos (`src/lib/recursos/oferta.ts` → `planificar`, contrato
`architecture/apps-en-la-malla.md` §4) y un módulo nuevo, `src/lib/recursos/servicios-pesados.ts`, traduce los
requisitos de cada servicio (ComfyUI, LibreTranslate, Stirling-PDF, ArchiveBox, el Agent Server de OpenHands,
Coolify) en una petición y elige dónde corre, con su motivo, su respaldo y lo que falta. El orden de búsqueda:

1. el propio aparato, si cabe en lo que presta (nunca la Mac con el enjambre escribiendo o con la presión de
   memoria en aviso);
2. las neuronas de la misma cuenta;
3. los servidores del cerebro (`brain_server_links`: el A1, servidores propios, los que administra Coolify);
4. los vecinos de la malla que prestan en público, con su confianza;
5. **las capas de conciencia públicas**, cada una con su estado real:

| Capa | Qué da | Estado el 2026-10-20 |
|---|---|---|
| Oracle A1 (Always Free) | 2 OCPU, 12 GB, arm64, Docker, encendida 24/7, sin GPU | activa: la única capa pública siempre encendida |
| Cloud Run | escala a cero, CPU; GPU solo de pago | fuera: facturación de Google desactivada desde el 2026-09-25; vuelve con la palabra de Alex |
| Spaces de Hugging Face | modelos de imagen con cuota diaria | activa solo con permiso de la persona (capa «espacio» de las imágenes) |
| cualquier otro | el servidor que una persona, grupo o comunidad registre | entra por `brain_server_links` o Coolify, con su capacidad medida |

Reglas (las restricciones ganan a las preferencias): la privacidad primero (§2); la capacidad es la **medida o
declarada por su dueño**, nunca inventada (hoy `linkedServerToOfertaNeurona` pone 1.024 MB y sin GPU a todo
servidor: se corrige); un servicio cuya arquitectura no está verificada en esa capa no se coloca allí hasta
medirlo (varias imágenes de Docker solo constan para amd64 y el A1 es arm64); con «GPU necesaria» y ninguna oferta
con GPU, el suelo honesto es la web gratis (Pollinations o un Space) diciendo qué falta, nunca «nada» ni un
servicio que no cabe; lo que corre en una capa pública lo administra Genesis/MetaGenesis (`oracle_nodo.py` en el
A1, Coolify en los servidores Linux, `gcloud` cuando haya facturación). Hoy ninguna capa gratis tiene GPU
persistente: lo dice la ficha, no se promete.

## 4. Traducción en todo el OS

Capas, de lo más cercano a lo más lejano: **el traductor del propio navegador** cuando existe (Translator API en
el aparato, sin red; si el navegador no lo tiene, se salta) › **LibreTranslate de la neurona** (127.0.0.1:5000) ›
**LibreTranslate de la malla o de una capa de conciencia** (el A1) › **Astraura** (el enrutador de IA gratis
primero) para los idiomas o contextos que Argos no cubre. Cada traducción dice qué motor la hizo.

- **Clic derecho** sobre un texto: «Traducir selección», «Traducir este párrafo», «Traducir toda la página» y
  «Ver original». Mayúsculas + clic derecho abre el menú del navegador; en campos editables manda el menú del
  navegador salvo que se pida. Convive con el menú de «Variaciones públicas» del clic derecho (una sola capa de
  menú, no dos).
- **Página entera:** recorre los nodos de texto visibles (nunca `script`, `style`, `code`, `pre`, campos
  editables ni lo marcado `translate="no"`), traduce por lotes, guarda el original de cada nodo para volver con un
  toque, marca `lang` en lo traducido (lectores de pantalla) y sigue los textos nuevos que aparezcan.
- **Por perfil:** idioma de lectura y autotraducción por contexto (páginas, mensajes, publicaciones, agentes,
  Astraura): nunca, preguntar o siempre. Se sincroniza con la cuenta como el resto de ajustes.
- **Agentes y Astraura:** las herramientas `traducir` y `editar_pdf` en el Taller del agente, con las mismas capas
  y la misma regla de privacidad.
- **La marca no se traduce:** StarSeed, Astraura, Genesis, MetaGenesis, PoliGenesis, ProtoGenesis, Protomolécula,
  Trinity, nombres de personas, código y rutas.

## 5. Tareas del enjambre (cola `cola-repos-libreria-1020d.json`)

- **Biblioteca y conectores:** RLB1020P (el cargador lee la 4.ª tanda, no duplica Coolify, OpenHands ni
  Stirling-PDF y corrige la URL de OpenHands), RLB1020Q (siembra de las «siempre»), RLB1020R (URL canónica de
  ComfyUI y fichas de Stirling-PDF y LibreTranslate en la Protomolécula), RLB1020S (Hub de Conectores: ComfyUI,
  LibreTranslate, Coolify, OpenHands y ArchiveBox), GDL1020A (canal de versiones de Codeberg).
- **Imágenes:** IMG1020A (plantillas de flujo), IMG1020B (cliente de flujos), IMG1020C (Astraura genera con
  ComfyUI de verdad).
- **Capacidad:** PES1020A (servicios pesados y su colocación), PES1020B (un servidor no inventa capacidad),
  CLF1020A (Coolify en solo lectura).
- **Traducción:** TRD1020A (cliente de LibreTranslate), TRD1020B (motor por capas), TRD1020C (página entera),
  TRD1020D (preferencias por perfil), TRD1020E (menú del clic derecho con registro de entradas, compartido con
  Variaciones públicas), TRD1020G (traducir selección, párrafo y página con «Ver original»), TRD1020F
  (herramientas `traducir` y `editar_pdf` de los agentes).
- **Archivo, envíos, entornos y PDF:** ARC1020A (plan de archivo de las fuentes de la Biblioteca), LSD1020A
  (protocolo LocalSend v2 puro), LSD1020B (LocalSend como enlace de la malla en la app nativa y los servidores),
  ENT1020A (entorno completo: guardar, duplicar, replicar y compartir), PDF1020A (cliente de Stirling-PDF según lo
  que la instancia tenga), PDF1020B (editar PDF en todo medio donde se abra).

## 6. Lo que necesita la palabra de Alex

Instalar servidores es descargar programas: LibreTranslate, Stirling-PDF y ArchiveBox en el A1 (midiendo antes
RAM y arquitectura), ComfyUI en el A1 (cola lenta) o en la Mac (modelos pequeños, sin enjambre), Coolify en un
servidor Linux que no sea el que escribe el enjambre, el Agent Server de OpenHands en el A1, la demo de Harness² en
un sandbox, LocalSend en los aparatos de Alex y OpenRig (con copia de la configuración de Claude y Codex antes). Una por una y con su medida antes de abrirla a nadie.
