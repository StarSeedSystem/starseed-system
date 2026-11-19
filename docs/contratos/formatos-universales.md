# Contrato de formatos universales — abrir cualquier archivo de cualquier sistema (FMT1119A)

> Pedido de Alex (2026-11-19): aceptación universal de formatos de archivo y de conexión, sin
> exclusividad ni discriminación entre macOS, Windows, Linux, Android, iOS, SteamOS y todo lo que se
> pueda; ante un formato nuevo o desconocido, herramientas autoadaptables e inteligentes, con
> libertad de ajustes y modificaciones, para investigar e instalar lo necesario para abrirlo o
> ejecutarlo.

Convención: **[verificado]** = leído en el código de este repositorio (`archivo:línea`);
**[conocimiento]** = se sabe de fuera y hay que medirlo antes de prometerlo. Este documento no
escribe código de producto: fija el contrato y deja la cola de tareas.

## 1. Alcance

- Un solo camino para **ver, convertir, abrir con contenedor o emulador** cualquier archivo, venga
  del aparato, de la Biblioteca, de un mensaje o de otro sistema.
- El tipo se decide **por el contenido** (bytes mágicos y estructura), no por la extensión ni por
  el MIME declarado; la extensión y el MIME son pistas que se contrastan, nunca la verdad.
- Lo desconocido no se rechaza: se **investiga**, se explica y se propone. La persona decide.
- Lo mismo vale para las **conexiones**: ningún medio ni protocolo se descarta por el sistema del
  que venga; se reconoce por su saludo y su estructura, y lo que falte se propone con la misma ley.
- Nada se ejecuta ni se instala sin su aceptación explícita. Nada recibido se abre ni se ejecuta
  para analizarlo. Nunca se borra nada de la persona.

## 2. Lo que ya existe (no se rehace)

### 2.1 Visores [verificado]

| Pieza | Ruta | Qué hace hoy |
|---|---|---|
| Tipos y detección | `src/components/dashboard/apps/content/content-types.ts:14` y `:65` | `ContentKind` y `detectKind` deciden por MIME y por extensión; **todavía no por bytes**. |
| Registro de visores | `src/components/dashboard/apps/content/viewer-registry.tsx:28` y `:43` | Mapa `kind → componente`; el 3D carga con `next/dynamic` y `ssr:false`. |
| Visores | `src/components/dashboard/apps/content/viewers.tsx:18`, `:113`, `:176`, `:255` | Imagen, galería, vídeo/audio, PDF, HTML, documentos, código y respaldo honesto. |
| Vista previa universal | `src/components/files/file-preview.tsx:1` | Vista rica por formato y acciones (insertar, abrir aparte, pizarra, publicar). |
| Vista previa de Biblioteca | `src/components/library/finder/item-preview-pane.tsx:29` | Panel de vista previa del Explorador. |
| Visor del chat | `src/components/aurora/universal-viewer.tsx:4` | Detecta multimedia en el texto del mensaje y la pinta bajo la burbuja. |
| Selector de avatar/3D | `src/lib/avatares/seleccion-visor.ts:5` | Elige visor GLB, VRM o procedural según la referencia. |

### 2.2 Reconocer el tipo y analizarlo sin ejecutar [verificado]

- `src/lib/network/inspeccion-archivos.ts:125` (`tipoRealPorBytes`) ya lee firmas: MZ, ELF,
  Mach-O, scripts `#!`, PNG, JPEG, GIF, PDF, ZIP, OLE, ISO-BMFF (`ftyp`), RIFF, EBML, MP3, OGG,
  FLAC, 7Z, RAR y GZIP. `:241` (`inspeccionarArchivo`) contrasta el tipo real con la extensión y
  el MIME, y `:341` (`nivelDeEnvio`) resume el envío. `:80` (`extensionDe`) normaliza el nombre.
- `src/lib/malla/cristal/centinela.ts:79` repite la detección de ejecutables por bytes mágicos para
  la malla.
- `src/lib/network/inspeccion-ia.ts:15` define la petición de inspección con IA (resumen de
  metadatos, nunca el contenido ejecutado).
- `src/lib/mensajeria/neuronas/datos-neurona.ts:305` y `:317` deciden cómo se muestra y con qué
  MIME seguro se sirve un adjunto recibido.
- Hueco declarado en `architecture/dashboard-launcher-apps-y-archivos.md:138`: «firma de tipo por
  magic-bytes para archivos sin extensión». Hoy existe para seguridad; falta para decidir visor.

### 2.3 Conversores [verificado]

- **Filee**: `src/lib/conversion/formatos.ts:14` y `:91` (255 formatos, orden de destinos),
  `src/lib/conversion/filee-servidor.ts:172` (`convertirConFilee`, sin shell, 500 MB, 15 min, 2 a
  la vez), `src/app/api/conversion/route.ts:23` y `:35` (estado y conversión),
  `src/lib/conversion/cliente.ts:202` y `:295` (cliente y enlace). Contrato:
  `architecture/conversion-archivos.md`.
- **Protomolécula**: `src/lib/protomolecula/convertidores.ts:90` (`rutaDeConversion`), `:132`
  (`ejecutarRuta`) y `:158` (`explicarSinRuta`), con los pasos base en
  `src/lib/protomolecula/convertidores-base.ts:9` y Filee como paso de servicio en
  `src/lib/protomolecula/conv-filee.ts:20`.
- **«Convertir a…» en la vista previa**: `src/lib/conversion/vista-previa.ts:24` lleva el archivo
  a `/convertir` con su nombre; no convierte por su cuenta.

### 2.4 Biblioteca e instalación [verificado]

- `src/lib/library/packages.ts:130` define `LibraryPackage`; `src/lib/protomolecula/catalogo-herramientas.ts:154`
  define `HerramientaProto` con `formatos: {entrada, salida}`, `medios` por sistema (`:132`) y
  licencia; `:4554` (`aPaqueteBiblioteca`) convierte una herramienta en ficha de Biblioteca con
  `proximamente` cuando no es integrable.
- Catálogo real con motores útiles: LibreOffice (`:708`), FFmpeg (`:2729`), Pandoc (`:2771`),
  ffmpeg.wasm (`:1420`) y Filee (`:2832`).
- Instalación por enlace: `src/lib/library/install.ts:47` (`buildInstallPath`) y `:80`
  (`parseInstallParams`). La pestaña de Biblioteca de Astraura reutiliza el mismo `install()`:
  `src/components/astraura/s158/biblioteca-tab.tsx:1`.
- Sembrado honesto en `src/lib/library/defaults-seed.ts:78` (`SEED_VERSION`); lo que no corre se
  marca y no se finge instalado.

### 2.5 Envío y recepción de archivos [verificado]

- **Archivos de la persona**: `src/lib/files/os-files.ts:57` (`MAX_UPLOAD_BYTES`, 50 MB), `:162`
  (`UploadFileOptions`), `:1145` (`UniversalAttachment`) y `:1173` (`fileToAttachment`).
- **Por la malla**: `src/lib/network/archivos-malla.ts:223` (`DestinoArchivo`), `:229`
  (`MsgOferta`), `:286` (`MsgAceptar`) y `:514` (trozo de 16 KB). La oferta existe **antes** de
  recibir: la persona acepta o rechaza con nombre, tamaño, tipo, origen y medio.
- **Envíos agrupados**: `src/lib/network/envios-entrantes.ts:12` (ventana de 20 s) y
  `src/components/network/envios-entrantes.tsx` (una sola ventana para todo el envío).
- **Vista previa de la oferta**: `src/lib/network/vista-previa-envio.ts:1` (miniatura o primeros
  caracteres de texto; nunca dibuja SVG).
- **Ajuste por neurona reconocida**: `src/components/settings/neurons/ajuste-envios-archivos.tsx`
  (la opción de aceptar sin preguntar es por neurona y está apagada por defecto).
- **Límite por medio**: `src/lib/mensajeria/neuronas/datos-neurona.ts:487` y `:492` deciden si un
  archivo cabe en el medio elegido antes de enviarlo.

### 2.6 Instalador y plataformas [verificado]

- `src/components/astraura/s158/instalador-tab.tsx:1` presenta primero el sistema de quien mira,
  trae el script real de `/api/installer/script` y cae a fragmentos estáticos **diciéndolo**.
- `src/lib/astraura/astraura-158-client.ts:1909` reúne el instalador universal, el descubrimiento
  acotado y la modificación del sistema **solo con consentimiento** (`:1972`).
- `src/ai/astraura/mesh/native-access.ts:19` reconoce `android · ios · windows · macos · linux ·
  chromeos · unknown`; SteamOS entra como `linux` y las consolas/TV como `unknown` hasta medirlas.

### 2.7 Huecos reales que cubre este contrato

1. `detectKind` no usa bytes: un `.dat` que es PNG cae en «desconocido».
2. No hay un catálogo único de **paquetes y ejecutables** por sistema (`.dmg`, `.pkg`, `.app`,
   `.exe`, `.msi`, `.deb`, `.rpm`, `.AppImage`, `.flatpak`, `.apk`, `.aab`, `.ipa`) con su plan.
3. No existe una **propuesta razonada** para formatos desconocidos: ni qué es, ni de dónde viene,
   ni qué riesgo tiene, ni qué contenedor o emulador lo abriría.
4. Los ajustes de apertura no se guardan **por formato**; cada visor decide por su cuenta.
5. El análisis de seguridad existe, pero no está unido al plan de apertura ni a la conversión.


## 3. Diseño

### 3.1 Principios (mandan sobre la comodidad)

1. **No exclusividad.** Ningún sistema es «el bueno»: macOS, Windows, Linux, Android, iOS, SteamOS,
   ChromeOS y lo que llegue se tratan con la misma tabla y el mismo respeto.
2. **Propone, no impone.** Todo lo que instala, ejecuta o cambia ajustes necesita un «sí» de la
   persona, dicho con qué es, de dónde viene, qué ocupa y qué riesgo tiene.
3. **Analiza sin abrir.** La inspección lee metadatos y bytes iniciales/finales; jamás ejecuta el
   archivo ni lo carga en un visor que pueda ejecutar código.
4. **Nunca borra.** Ni el original, ni la versión anterior, ni lo descargado: se mueve a
   «Cuarentena» o «Recientes» y se puede recuperar.
5. **Honestidad.** Si en este aparato no hay forma real de abrirlo, se dice y se ofrece el camino;
   no se finge un visor, una conversión ni una instalación.

### 3.2 Cómo se reconoce el tipo (tubería)

1. **Pistas**: nombre y extensión (`extensionDe`), MIME declarado, tamaño y origen.
2. **Bytes**: primeros 64 KB (`inicio`) y, si el formato lo exige, últimos 512 B (`final`). Las
   firmas se amplían en un catálogo puro con familias y confianza.
3. **Contraste**: tipo real contra extensión y MIME; una discrepancia no bloquea, **avisa** y baja
   la confianza.
4. **Estructura**: para ZIP y derivados, lista de rutas (`listarZip`) sin extraer; para ISO/UDIF,
   marcas en posiciones conocidas.
5. **Veredicto**: `{tipo, familia, confianza: alta|media|baja, pistas[], discrepancia?}`. Con
   confianza baja, el plan es «investigar», nunca «ejecutar».

### 3.3 Formatos comunes por familia y sistema

| Familia | Ejemplos | Lo que se mira | Plan del OS |
|---|---|---|---|
| Instaladores de macOS | `.dmg`, `.pkg`, `.app` | UDIF con cola `koly` al final; `.pkg` plano es `xar!` (también hay `.pkg` en carpeta); `.app` es una carpeta con `Info.plist` | Ver ficha y, si hay lector, la lista de contenido; montar o abrir solo en macOS; en otro sistema, contenedor/VM o investigar |
| Instaladores de Windows | `.exe`, `.msi` | `MZ`; `.msi` es OLE `D0CF11E0A1B11AE1` | Ver ficha y firma; ejecutar solo en Windows o con Wine/Proton/VM, nunca en silencio |
| Paquetes de Linux | `.deb`, `.rpm`, `.AppImage`, `.flatpak` | `!<arch>` AR; `ED AB EE DB`; ELF con `AI` en el byte 8; Flatpak es OSTree/ref (a menudo texto INI) | Leer metadatos y lista de archivos; instalar solo con orden explícita; `.AppImage` se ejecuta si la persona lo permite |
| Android | `.apk`, `.aab` | ZIP; `AndroidManifest.xml` + `classes*.dex` (APK) o `BundleConfig.pb` (AAB) | Ver ficha; ejecutar en Android o contenedor Android; `.aab` no se instala directo |
| iOS/iPadOS | `.ipa` | ZIP con `Payload/*.app` | Ver metadatos; no se ejecuta fuera de iOS sin contenedor investigado |
| Documentos | PDF, Office, ODF, EPUB, texto | `%PDF`, OLE, ZIP con `[Content_Types].xml` o `mimetype` | Ver en el OS; convertir con Filee/LibreOffice/Pandoc; nunca macros activas |
| Imágenes | PNG, JPEG, GIF, WebP, HEIC, AVIF, TIFF, SVG | Firmas; ISO-BMFF `ftyp`; RIFF; SVG es texto | Ver; convertir con Filee; SVG/HTML se muestran **sin scripts** |
| Audio | MP3, WAV, OGG, FLAC, M4A, AAC | `ID3`/`FFFB`, `RIFF/WAVE`, `OggS`, `fLaC`, `ftyp` | Reproducir; convertir; ajustes de pista y calidad |
| Vídeo | MP4, MKV, WebM, MOV, AVI | ISO-BMFF, EBML, RIFF/AVI | Reproducir si el códec existe; si no, convertir con FFmpeg |
| 3D | GLB/glTF, FBX, OBJ, STL, USDZ, 3MF | `glTF`, cabecera «Kaydara FBX Binary», texto OBJ/STL, ZIP en USDZ/3MF | Ver en el visor 3D; convertir; ajustes de escala y materiales |
| Comprimidos | ZIP, RAR, 7Z, TAR, GZ, XZ, BZ2, ZSTD, CAB, ISO | `PK`, `Rar!`, `7z¼¯'`, `ustar` en 257, `1F 8B`, `FD 37 7A 58 5A 00`, `BZh`, `28 B5 2F FD`, `MSCF`, `CD001` en 0x8001 | Listar sin extraer; extraer a una carpeta nueva; avisar de rutas de escape y anidados |
| Proyectos de código | `.zip` de repo, `.vsix`, `.jar`, `.whl`, `.git bundle` | ZIP/`# v2 git bundle`; carpetas con `package.json`, `Cargo.toml`, `.sln` | Ver y buscar; abrir en editor aislado; ejecutar solo en sandbox |

Las firmas de esta tabla que aún no están en `tipoRealPorBytes` son **[conocimiento]** hasta que
las pruebe FMT1119C; la cola las mide con cabeceras sintéticas antes de prometerlas en la interfaz.

### 3.4 Plan de apertura (una sola respuesta tipada)

`planDeApertura(entrada)` devuelve **una** de estas acciones, con su motivo y su riesgo:

| Acción | Cuándo | Qué hace / qué no hace |
|---|---|---|
| `ver` | Hay visor nativo o seguro | Abre en el visor del OS; nunca ejecuta el archivo |
| `convertir` | Hay conversor real para ese destino | Convierte una copia; el original queda intacto |
| `contenedor` | El formato necesita un entorno (Wine/Proton, DOSBox, Android, VM) | Explica qué contenedor, de dónde sale y qué aísla |
| `emulador` | El formato es de otra máquina o consola | Propone emulador; el firmware o BIOS solo se enlaza a su fuente oficial, nunca se incluye ni se piden claves |
| `investigar` | Tipo o confianza insuficiente | Pasa al agente de Astraura; no abre ni instala |
| `no-aplica` | El formato no se puede abrir en este aparato | Lo dice y ofrece moverlo, guardarlo o exportarlo |

Reglas del plan: depende del **sistema real** (`detectPlatform`), no del que la persona diga; un
mismo archivo puede dar planes distintos en macOS y en Android; toda acción que instale, ejecute o
extraiga lleva `requiereConsentimiento: true` y una explicación previa.

### 3.5 Formato desconocido: el agente de Astraura [diseño]

1. **Pista**: nombre, tamaño, MIME, bytes iniciales/finales, rutas si es ZIP y origen. Nunca el
   contenido completo ni datos privados del archivo.
2. **Investigación**: identifica familia, firma conocida, software que lo produce y si hay
   especificación pública. Si no hay certeza, lo dice.
3. **Propuesta** (una ficha, no una orden): qué es · de dónde viene (fuente oficial o Biblioteca) ·
   licencia · tamaño de descarga · qué aislamiento ofrece · qué riesgo tiene · cómo se deshace.
4. **Consentimiento**: la persona acepta, rechaza o pide otra opción. El agente nunca instala solo,
   ni siquiera cuando «sabe» qué es.
5. **Ejecución y ajustes**: se instala o se abre con el plan aceptado, se guardan los ajustes por
   formato y se deja el camino para repetirlo con un clic.

La Biblioteca es la primera fuente; la fuente oficial del proyecto es la segunda. Foros, mirrors y
ejecutables sin firma no se proponen como instalación: como mucho, se enlazan con su riesgo.

### 3.6 Ajustes libres por formato

Esquema `starseed.formatos.ajustes.v1`, con alcance **archivo → carpeta → global** (gana el más
concreto), validado y exportable. Ejemplos: imágenes (escala, calidad, perfil de color, fondo),
audio (pista, ganancia, formato de salida), vídeo (pista, subtítulos, códec, fotograma), 3D
(escala, materiales, luz), documentos (fuente, márgenes, contraseña de apertura), comprimidos
(carpeta destino, conservar rutas) y paquetes (aislamiento, carpeta de instalación, desinstalar).
Los ajustes nunca cambian el original sin una copia explícita.

### 3.7 Conexiones: los mismos principios

Un archivo también llega por una conexión. Se reconocen por lo que **dicen al conectarse**, no por
el nombre del aparato: USB/MTP y almacenamiento masivo, ADB, SMB/CIFS, SFTP/SCP, WebDAV, FTP/FTPS,
NFS, Bluetooth (OPP/BLE), WebRTC y la malla del OS (`src/lib/network/archivos-malla.ts:229`,
`architecture/archivos-malla-p2p.md`). Reglas: (1) se prueban en orden de menos a más privilegio;
(2) toda conexión muestra quién es, qué pide y qué comparte antes de abrirse; (3) un protocolo
desconocido se investiga con un agente y puede proponer un conector de la Biblioteca o de su fuente
oficial, pero **no se instala sin aceptación**; (4) nunca se piden credenciales de la persona para
una conexión que no haya elegido; (5) si el sistema no puede, se dice y se ofrece el medio alterno
(cable, tarjeta, otra neurona de la cuenta) sin descalificar el origen.

### 3.8 Identidad y accesibilidad de la ficha [diseño]

- Una sola identidad por contexto, según `memory/diseno/identidades.md`: el OS usa sus tokens
  Trinity y cristal; Genesis, su cristal operativo; Astraura, su velo técnico. No se inventan
  hexadecimales nuevos.
- La ficha de propuesta usa proporción φ (`1.618:1`) o `3:2` para el soporte visual y `1:1` para el
  icono del formato; el contenido manda y no se recorta para forzar la proporción
  (`memory/diseno/armonia.md`).
- Espaciado Fibonacci, radios de una sola familia y un solo foco visual: el botón que de verdad
  avanza («Ver», «Convertir», «Investigar»).
- Movimiento solo con `transform` y `opacity`, 150–300 ms, y alternativa con
  `prefers-reduced-motion`. Contraste ≥ 4.5:1, foco visible y dianas ≥ 44 px.
- Español neutro y directo; los formatos se nombran con su extensión y su nombre común, sin siglas
  sin explicar. Nada de emojis como iconos: Lucide.

## 4. Reglas duras

1. **Nada se ejecuta ni se instala sin aceptación explícita.** El agente propone, explica qué es,
   de dónde viene y qué riesgo tiene; la persona decide. Vale para visores que ejecutan código,
   contenedores, emuladores, paquetes y cambios de ajustes del sistema.
2. **Lo recibido se analiza sin abrirlo ni ejecutarlo.** Se leen nombre, tamaño, tipo real, firma y
   estructura; después se muestra. La cuarentena termina cuando la persona acepta.
3. **Nunca se borra nada de la persona.** Ni originales, ni versiones anteriores, ni descargas. Se
   puede mover, archivar o marcar; borrar es una acción aparte, confirmada y reversible cuando se
   pueda.
4. **Un formato no se rechaza por su origen.** Un `.exe` de Windows o un `.dmg` de macOS se analizan
   igual que un `.deb`: con la misma tabla, el mismo aviso y el mismo derecho a abrirse.
5. **La lógica es pura y con pruebas.** Detección, plan, ajustes y propuesta se prueban sin red, sin
   disco y sin DOM; los efectos viven en su capa aparte.
6. **Nada de claves.** Solo nombres de variables de entorno. Los ajustes no guardan credenciales.
7. **Sin `any`**, sin `Date.now()` dentro de las funciones puras (el «ahora» entra como parámetro) y
   sin dependencias nuevas sin tarea propia.

## 5. Estados y mensajes honestos

| Estado | Qué ve la persona | Lo que nunca pasa |
|---|---|---|
| Reconocido con visor | Tipo, visor elegido y botón de abrir | Abrir sin que la persona lo pida |
| Reconocido sin visor | «Este aparato no lo abre solo» + plan | Callar o mostrar un error vacío |
| Conversión disponible | Formato de salida y qué se conserva | Prometer un destino que Filee no da |
| Necesita contenedor | Qué contenedor, qué aísla y qué ocupa | Instalarlo por su cuenta |
| Desconocido | «No sé qué es todavía» + «Investigar» | Ejecutarlo «para ver qué pasa» |
| Investigación fallida | Qué se intentó y qué falta | Inventar un programa o una fuente |
| Sin red | Lo que se puede hacer en local | Bloquear la vista por no tener internet |

## 6. Privacidad y red

- La detección, la inspección y los ajustes son **locales**. Solo sale lo que la persona consiente:
  un resumen de metadatos para que el agente investigue, o una conversión a una neurona propia.
- La consulta a una fuente oficial se hace **solo** con el nombre del formato y datos públicos; no
  viaja el contenido del archivo ni el nombre de la persona.
- Modo privado: no se consulta ningún servicio externo; se usan solo Biblioteca local, reglas y
  conversores ya instalados, y se dice que la investigación queda limitada.

## 7. Puertas y pruebas

- `bash scripts/enjambre/tsc-turno.sh` (nunca `npx tsc` suelto) y `npx vitest run <carpeta>` de la
  tarea; la salida se lee entera hasta su resumen.
- Pruebas de cada módulo puro con cabeceras sintéticas: MZ, ELF, Mach-O, `xar!`, `!<arch>`, RPM,
  `koly`, ZIP con `AndroidManifest.xml`/`Payload`/`BundleConfig.pb`, GLB, PDF, ISO-BMFF y RIFF; y
  casos negativos (extensión mentirosa, confianza baja, propuesta sin consentimiento).
- Antes de publicar, `next build` completo; ningún módulo puro importa `node:*`.

## 8. Cola de esta ola

Se entrega en `starseed_memory_root/olas/cola-formatos-universales-1119.json` (FMT1119C–H):

| Tarea | Qué entrega |
|---|---|
| FMT1119C | Catálogo puro de firmas y familias, con confianza y pistas |
| FMT1119D | Plan de apertura por sistema, con consentimiento obligatorio |
| FMT1119E | Ajustes por formato, herencia archivo→carpeta→global y validación |
| FMT1119F | Propuesta del agente para lo desconocido, validada y sin instalar sola |
| FMT1119G | El visor pregunta primero por el contenido y añade la ficha de paquete |
| FMT1119H | Catálogo de contenedores y emuladores con fuente oficial y aislamiento |

## 9. Límites que este contrato no cruza

- No promete ejecutar `.ipa`, `.app` ni `.aab` fuera de su sistema sin un contenedor real medido.
- No incluye firmware, BIOS ni claves de consolas: solo se enlaza la fuente oficial cuando exista.
- No sustituye un antivirus ni una sandbox del sistema: suma su análisis y lo dice.
- No descarga binarios opacos ni «instaladores universales» sin firma y sin consentimiento.
- No toca archivos ajenos a la apertura: nada de reescribir, renombrar o borrar por su cuenta.
