# Formatos universales · contrato de apertura y recepción

**Ola:** 1119 · **Tarea:** FMT1119A · **Área:** diseño
**Fecha:** 2026-11-19 · **Estado:** contrato listo para repartir en tareas
**Pedido:** Alex, 19-11-2026.

## 0. Qué resuelve

StarSeed OS acepta cualquier archivo que llegue por la malla, sin exclusividad ni discriminación por sistema: macOS, Windows, Linux, Android, iOS, SteamOS y lo que venga. La persona debe poder ver, inspeccionar, convertir o preparar un archivo aunque su formato no sea nativo en el dispositivo donde lo recibe.

Este contrato separa tres cosas que suelen confundirse:

1. **Reconocer** el archivo por lo que contiene, no por su nombre.
2. **Abrirlo** con un visor o un conversor que ya existe, o prepararlo para el sistema correcto.
3. **Investigar e instalar** lo necesario cuando el formato es desconocido, siempre con aceptación explícita de la persona.

Nada de este contrato autoriza a ejecutar, instalar ni borrar por iniciativa del sistema. El agente propone; la persona decide.

## 1. Lo que ya existe

El repositorio ya tiene las piezas del recorrido. Esta ola no las reescribe: las mide, las conecta y cubre lo que falta.

| Pieza | Dónde vive | Qué hace hoy | Límite que cubre esta ola |
|---|---|---|---|
| Abridor Universal | `src/components/dashboard/apps/content/content-types.ts` (`detectKind`:65, `fromFile`:118), `content-opener.tsx` (`useContentOpener`:50), `viewer-registry.tsx`:27 | Convierte un archivo o enlace en un `ContentKind` y elige visor | Decide por MIME y extensión; no lee bytes mágicos ni distingue «ejecutable» de «documento» |
| Visores incluidos | `src/components/dashboard/apps/content/viewers.tsx` (`ImageViewer`:25, `GalleryViewer`, `MediaPlayer`, `PdfViewer`, `HtmlViewer`, `DocViewer`, `FallbackViewer`), `viewer-registry.tsx` (`ModelViewer`:18) | Imagen, GIF, galería, vídeo, audio, PDF, HTML, markdown, código, texto y 3D | `FallbackViewer` no explica el formato ni ofrece camino seguro |
| Visor flotante | `src/components/dashboard/widgets/universal-opener-widget.tsx` (`UniversalOpenerWidget`:91, `abrirArchivos`:121, `raiz`:135) | Arrastrar y soltar, o elegir archivos, y abrirlos en ventana | Acepta cualquier archivo, pero delega en el abridor y no propone instalar nada |
| Adjuntos y vista previa | `src/components/files/file-preview.tsx` (`EXT_MAP`:94, `extOf`:107, `detectFormat`:113, `ActionBar`:212), `universal-attachment-view.tsx`:63 | Previsualiza adjuntos y ofrece acciones por formato | La tabla es por extensión; un archivo renombrado engaña al visor |
| Recepción y transferencia | `src/lib/network/archivos-malla.ts` (`crearMotorArchivos`:1665, `iniciarMotorArchivosPorMalla`:3353, `subirArchivoLocalACuenta`:3464), `envios-entrantes.ts` (`agruparEnvios`:98, `arbolDeEnvio`:144, `VentanaEnvio`:443, `EnviosEntrantes`:711), `file-request-listener.tsx`:50, `transferencias-archivo-panel.tsx`:253 | Recibe por la malla, agrupa, muestra el árbol y guarda local antes de subir a la cuenta | El límite de subida a cuenta es `MAX_UPLOAD_BYTES` = 50 MB (`os-files.ts`:57); la recepción P2P no tiene ese tope |
| Inspección y centinela | `src/lib/network/inspeccion-archivos.ts` (`tipoRealPorBytes`:125, `listarZip`:195, `inspeccionarArchivo`:241, `nivelDeEnvio`:341, `resumenParaIA`:361, `leerVeredictoIA`:393), `src/lib/malla/cristal/centinela-archivos.ts` (`decidirEntrada`:29), `src/lib/malla/cristal/centinela.ts` (`analizarArchivo`:74), `vista-previa-envio.ts`:46 | Ya hay lectura de bytes y decisión de entrada, con pruebas en `src/lib/network/__tests__/inspeccion-archivos.test.ts` | Vive en la recepción, no en el visor: un archivo local o de la Biblioteca no pasa por ahí |
| Conversión | `src/lib/conversion/formatos.ts` (módulo puro; Filee, 255 formatos; `formatoDe`:47, `leerDestinos`:72, `ordenarDestinos`:123, `nombreDeSalida`:141), `cliente.ts` (`RUTA_CONVERSOR`:15, `convertirBlob`:202), `filee-servidor.ts` (`MAX_BYTES_CONVERSION`:21 = 500 MB, `convertirConFilee`:172), `src/app/api/conversion/route.ts`:35, página `/convertir` | Convierte imagen, audio, vídeo, 3D y documentos con Filee, en local o por el servidor | Es una acción aparte; el visor no la ofrece como salida cuando no puede mostrar el archivo |
| Protomolécula | `src/lib/protomolecula/catalogo-herramientas.ts` (`CATALOGO_PROTOMOLECULA`:249, categoría `conversion-formatos`:241, `aPaqueteBiblioteca`:4554), `conv-filee.ts`:20, `accion-agente.ts`:108, `biblioteca-protomolecula.ts`:58 | Catálogo de herramientas y conversores, con licencia y origen | No existe una categoría de contenedores/emuladores ni una acción de «investigar formato» |
| Biblioteca | `src/lib/library/packages.ts` (`LibraryPackage`:130, `VALID_KINDS`:198, `comingSoon`:147, `install`:2566), `src/components/library/dialogo-instalar.tsx`:48, ruta `/library` | Instala paquetes con diálogo y estados de «próximamente» | La instalación no recibe el contexto «este archivo, este formato, este riesgo» |
| Abrir app nativa en la malla | `src/lib/recursos/opciones-abrir.ts` (`comoAbrir`:54, `opcionesAbrir`:103), `modos-app.ts`:54, `montaje.ts`:84, `volumen.ts`:97, `lector-volumen.ts`:61, `abrir-en-menu.tsx`:35 | Monta `.app`, `.exe` o AppImage como volumen y elige local, por bandas, montada, transmitida o ramificada | Es para apps del catálogo, no para un archivo cualquiera que acaba de llegar |

**Lectura honesta:** el sistema ya inspecciona bytes en la puerta de entrada y ya sabe montar apps nativas, pero el visor universal sigue confiando en la extensión. Lo que falta no es otro motor: es un tipo real compartido, un plan de apertura y una propuesta de instalación con consentimiento.

## 2. Principios

- **La persona manda.** Ningún archivo se ejecuta, se instala ni se borra sin una aceptación explícita, por acto y por archivo.
- **Primero mirar, después tocar.** Se analiza el contenido sin abrirlo ni ejecutarlo; lo que no se entiende se conserva intacto.
- **Universal no significa fingir.** Si un `.exe` no puede correr en un iPhone, se dice; se ofrece inspeccionarlo, convertirlo o prepararlo para otro dispositivo.
- **Sin exclusividad.** Ningún sistema, formato ni tienda es requisito para recibir o entender un archivo.
- **Reversible.** Toda decisión (instalar, montar, convertir, aislar) se puede deshacer sin pérdida de datos.
- **Honesto con los límites.** Firmas, DRM, códecs privativos y ejecutables de otra arquitectura pueden impedir la apertura; el contrato lo declara en vez de prometer de más.
- **Español neutro, sin culpar a la persona.** Los avisos explican qué pasa, qué opciones hay y qué riesgo tiene cada una.

## 3. Identidad visual y geometría

La experiencia se llama **Umbral de formatos**: el punto entre «llegó un archivo» y «sé qué es y qué puedo hacer con él». No es una pantalla nueva con marca propia; usa la identidad transversal **StarSeed OS / Nexus** (`memory/diseno/identidades.md:8-16`) y, en la propuesta del agente, la subidentidad **Astraura** (`memory/diseno/identidades.md:18-23`).

- **Paleta:** `palette.trinity.zenith.active`, `horizonte.panel`, `logica.active` y `base.active`, con neutro `#F8F9FA`. El color semántico no inventa hex: «seguro» usa horizonte, «requiere decisión» usa lógica, «riesgo» usa base y «en curso» usa zenith. Astraura usa su cian `#00F0FF` solo en el panel de investigación, nunca en las acciones de la persona.
- **Tipografía:** Rajdhani para el nombre del formato y las cifras; Inter para cuerpo, explicaciones y botones; JetBrains Mono para bytes, hashes, extensiones y rutas. Máximo tres familias en la pieza.
- **Material:** cristal líquido translúcido con blur y refracción, como el resto del OS; el panel de decisión es una superficie sólida para que el texto no pierda contraste.
- **Movimiento:** entrada desde el perímetro con `--ease-glide` a 220 ms; el cambio de estado usa opacidad y `transform`, nunca layout. Con `prefers-reduced-motion`, sin desplazamiento ni pulsos.
- **Voz:** «Este archivo dice ser PDF, pero su contenido es un ZIP». «No puedo abrirlo aquí. Puedo enseñarte qué contiene, convertirlo o prepararlo para macOS». Nunca «formato inválido» ni «archivo corrupto» sin prueba.

### Geometría y proporción

- **Vesica piscis:** los dos círculos son **lo declarado** (nombre, MIME, extensión) y **lo real** (bytes). La intersección contiene el veredicto y la acción compartida. Si ambos coinciden, la forma se cierra; si no, la intersección se marca con un aviso y el botón principal cambia a «Ver qué contiene».
- **Flor de la Vida:** solo en el estado vacío o en el fondo del formato desconocido, `aria-hidden`, opacidad 22 %, detrás de un velo; nunca detrás de texto sin velo (`memory/diseno/armonia.md:110-117`).
- **Metatrón:** en la vista «Opciones» cuando hay más de dos caminos (visor, convertir, montar, contenedor, fuente oficial); los nodos son las opciones y las líneas, la relación de riesgo/requisito. No se usa en la tarjeta corriente.
- **Espiral áurea:** ordena la mirada hacia la **acción recomendada**, que ocupa el extremo cerrado de la composición; no curva texto ni navegación.
- **Rejilla:** en escritorio, `61.8 %` para la vista previa y `38.2 %` para el panel de decisión; en móvil colapsa a una columna con orden DOM propósito → vista → decisión. Espaciado en Fibonacci (8, 13, 21, 34, 55); radios de una sola familia (`--radius-sm` a `--radius-2xl`), sin mezclar la escala Antigravity.
- **Proporciones:** vista previa de documento `3:2`; vídeo `16:9`; icono o celda de catálogo `1:1`; el panel de decisión no fuerza proporción, crece con el contenido. `aspect-ratio` reserva el espacio para que no haya saltos.

**Prohibido:** un icono de sistema operativo como única explicación; prometer «se abre» sin haber mirado los bytes; usar la geometría como adorno interactivo; tapar el nombre real del archivo con una etiqueta comercial.

## 4. Detección por contenido

**Regla de oro:** el contenido manda; el nombre es una pista. La extensión y el MIME declarado se conservan para explicar la discrepancia, nunca para decidir si algo es seguro.

### Orden de lectura

1. **Firma en los primeros 64 KB.** Comparar bytes mágicos y estructuras conocidas.
2. **Interior del contenedor.** Si es ZIP, OLE, ISO-BMFF, XAR o UDIF, mirar entradas y metadatos para distinguir APK, AAB, IPA, OOXML, ODF, EPUB, JAR, USDZ o paquete de app.
3. **Cola del archivo.** Para ZIP, leer el directorio central en los últimos 256 KB; para DMG, el trailer `koly` en los últimos 512 bytes.
4. **MIME declarado por el sistema o el navegador.** Se usa como evidencia secundaria, nunca como verdad.
5. **Extensión.** Solo desempata entre familias compatibles.
6. **Heurística de texto** (XML, JSON, HTML, CSV, código, OBJ, STL ASCII) con umbral explícito y confianza baja.
7. **Desconocido.** Se declara `desconocido`; no se adivina un visor.

Cada resultado devuelve `tipo`, `familia`, `confianza` (`cierto`, `probable`, `declarado`, `desconocido`), `peligro` (`ejecutable`, `contenedor`, `documento`, `multimedia`, `datos`, `desconocido`) y `declarado` (nombre, MIME y extensión). `familia` y `peligro` son independientes: un `.pdf` que contiene `MZ` sigue siendo `peligro: ejecutable`.

### Firmas mínimas que debe cubrir el detector

| Familia | Firma / estructura | Nota |
|---|---|---|
| PNG | `89 50 4E 47 0D 0A 1A 0A` | — |
| JPEG | `FF D8 FF` | — |
| GIF | `GIF87a` / `GIF89a` | — |
| WebP | `RIFF` + `WEBP` en offset 8 | — |
| AVIF / HEIC | ISO-BMFF: `ftyp` en offset 4; marcas `avif`, `heic`, `heix`, `mif1` | Distinguir por marca, no por extensión |
| PDF | `%PDF-` | El `%%EOF` no basta: puede ser incremental |
| ZIP y derivados | `PK 03 04`, `PK 05 06`, `PK 07 08` | APK, AAB, IPA, JAR, OOXML, ODF, EPUB y USDZ comparten ZIP; hay que abrir el índice |
| 7z | `37 7A BC AF 27 1C` | — |
| RAR | `52 61 72 21 1A 07` (v4) / `… 01 00` (v5) | — |
| GZIP | `1F 8B` | — |
| TAR | `ustar` en offset 257 | — |
| ELF / AppImage | `7F 45 4C 46`; AppImage tipo 1/2: `AI 01` / `AI 02` en offset 8 | AppImage es ELF con marca propia |
| Mach-O | `CF FA ED FE` (64), `CE FA ED FE` (32), `CA FE BA BE` (universal) | `CA FE BA BE` también abre clases Java: desempatar por estructura |
| PE / EXE | `MZ` y `PE 00 00` en `e_lfanew` | Nunca enviar a un visor de documentos |
| MSI / OLE | `D0 CF 11 E0 A1 B1 1A E1` | También DOC/XLS/PPT antiguos |
| DEB | `!<arch>` (`21 3C 61 72 63 68 3E`) | — |
| RPM | `ED AB EE DB` | — |
| XAR / PKG | `xar!` (`78 61 72 21`) | `.pkg` de macOS |
| DMG | trailer UDIF `koly` en los últimos 512 bytes | También HFS/APFS dentro |
| `.app` | Directorio con `Contents/Info.plist` y `Contents/MacOS/` | No es un archivo: se detecta el bundle, no una firma |
| Flatpak | Contenedor con `metadata`, `app/`, `runtime/` y `export/` | No hay firma universal fiable: se declara «probable» |
| APK | ZIP con `AndroidManifest.xml` binario y `classes.dex` | — |
| AAB | ZIP con `base/manifest/AndroidManifest.xml` y `BundleConfig.pb` | No se instala directo; se convierte a APK |
| IPA | ZIP con `Payload/*.app/Info.plist` | Requiere firma para instalar en iOS |
| OOXML / ODF / EPUB | ZIP con `[Content_Types].xml` / `mimetype` = `application/epub+zip` | Distinguir por contenido, no por `.zip` |
| SQLite | `SQLite format 3\0` | — |
| WASM | `00 61 73 6D` | — |
| Audio / vídeo | `ID3` o `FF FB`; `OggS`; `fLaC`; `RIFF…WAVE`; ISO-BMFF `ftyp`; EBML `1A 45 DF A3` | El códec real puede no ser compatible con el navegador |
| 3D | `glTF` binario; FBX `Kaydara FBX Binary`; STL binario/`solid`; PLY `ply`; OBJ por contenido | USDZ es ZIP: mirar entradas `.usdc`/`.usdz` |
| Fuentes | `00 01 00 00`, `OTTO`, `wOFF`, `wOF2` | — |

### Discrepancias y archivos peligrosos

- **Benigna** (JPEG llamado `.png`): se abre según el contenido, con aviso discreto y opción de conservar el nombre. Nunca se renombra ni se borra solo.
- **Ejecutable disfrazado** (`MZ` llamado `.pdf`, `.jpg` o `.txt`): no se entrega al visor; se ofrece «Inspeccionar sin ejecutar», hash, tamaño, cadenas legibles y origen.
- **Contenedor con ejecutables dentro** (ZIP, 7z, RAR, DMG, ISO): se lista el contenido sin extraer; cada extracción y cada ejecución piden consentimiento. No se extrae en bloque «por comodidad».
- **Políglota** (válido como dos cosas): se muestran ambas lecturas y se elige la más segura; la ejecución nunca es la opción por defecto.
- **Cifrado o contraseña**: se pide la clave en un campo local, no se registra, no se envía y no se guarda en el historial.
- **Truncado o corrupto**: se dice qué falta y se conserva el original; no se «repara» sobrescribiendo.

### Límites declarados

La firma no es prueba de seguridad: un PDF válido puede explotar al visor y un ZIP válido puede contener malware. El detector solo decide **qué camino** tomar. Formatos ofuscados, cifrados o con firmas desconocidas terminan en `desconocido`, y ahí empieza el agente, no la adivinación.

**Pureza:** el detector será una función pura sobre `Uint8Array`; el análisis de contenedores recibe además la cola cuando hace falta. Sin DOM, red, disco, reloj ni aleatoriedad. No lanza con entradas truncadas; devuelve `desconocido` con motivo. Las pruebas usan vectores de bytes sintéticos y mínimos, sin descargar archivos de terceros.

## 5. Matriz de formatos y sistemas

La matriz no dice «se abre en todas partes». Dice **dónde se abre de verdad**, qué se puede hacer en el resto y qué no se promete. «Inspeccionar» siempre está disponible: listar, extraer, calcular hash, leer metadatos y convertir, sin ejecutar.

| Formato | En su sistema | En otro sistema, sin fingir | Lo que no se promete |
|---|---|---|---|
| `.dmg`, `.pkg`, `.app` (macOS) | macOS: montar o abrir con consentimiento; `.app` se monta como volumen, nunca se copia al disco (`opciones-abrir.ts`:15, `montaje.ts`:84) | Inspeccionar con 7z/XAR; extraer recursos; convertir documentos que haya dentro | Ejecutar una app de macOS en Windows, Linux, Android o iOS; Darling no es producción |
| `.exe`, `.msi` (Windows) | Windows: ejecutar con consentimiento y sandbox si está disponible | Wine/Proton/Bottles en macOS/Linux/SteamOS; VM Windows (UTM/QEMU/VirtualBox/Hyper-V); extraer MSI sin ejecutar | Ejecutar en Android, iOS o en el navegador; un `.exe` de otra arquitectura sin emulación |
| `.deb`, `.rpm`, `.AppImage`, `.flatpak` (Linux) | Linux: instalar con el gestor o ejecutar AppImage; Flatpak requiere runtime | Extraer con `ar`/`cpio`/`rpm2cpio`; contenedor Distrobox/Toolbx/Podman; VM Linux; WSL2 en Windows | Instalar un `.deb` en macOS, Android o iOS; ejecutar Flatpak sin runtime |
| `.apk`, `.aab` (Android) | Android: instalar APK con permiso; `.aab` no se instala directo | Waydroid en Linux; emulador Android Studio en macOS/Windows/Linux; `bundletool` convierte AAB a APK; inspeccionar manifiesto | Ejecutar en iOS, macOS o Windows nativo; instalar un AAB sin convertirlo |
| `.ipa` (iOS) | iOS/iPadOS: solo con firma válida y permiso de la persona | Descomprimir y auditar `Payload/*.app`; leer `Info.plist`; extraer recursos | Ejecutar en Android, Windows, Linux o macOS; saltarse la firma o el DRM |
| Documentos: PDF, DOCX/XLSX/PPTX, ODF, EPUB, Markdown, LaTeX, RTF | PDF, Markdown, HTML y texto nativos en el Abridor; DOCX/XLSX/PPTX, ODF, EPUB, LaTeX y RTF con Filee o el programa del sistema | Convertir con Filee (255 formatos); vista previa sin macros; extraer texto e imágenes | Ejecutar macros (`.docm`, `.xlsm`); abrir PDF con JavaScript activo por defecto; prometer un visor de EPUB que aún no existe |
| Imágenes: PNG, JPEG, GIF, WebP, AVIF, HEIC, RAW, PSD, SVG | Visor de imagen y galería; SVG se rasteriza sin scripts | HEIC/AVIF vía decodificador o conversión; RAW con vista embebida; PSD aplanado; Filee a PNG/JPEG | Ejecutar scripts de un SVG; interpretar RAW sin revelado; prometer color exacto sin perfil |
| Audio: MP3, M4A, WAV, FLAC, OGG, OPUS, AIFF | Reproductor del Abridor según códecs del navegador | Convertir con Filee/FFmpeg; extraer carátula y metadatos; waveform local | Reproducir DRM; garantizar todos los códecs en todos los navegadores |
| Vídeo: MP4, WebM, MOV, MKV, AVI, GIF | Reproductor del Abridor; subtítulos y pistas si el navegador las admite | Convertir con Filee/FFmpeg; extraer audio, subtítulos y fotogramas; HLS por la malla | Reproducir DRM; garantizar HEVC/ProRes en cualquier dispositivo |
| 3D: GLB/glTF, OBJ, STL, PLY, FBX, USDZ, BLEND | Visor 3D (`viewer-registry.tsx` (`ModelViewer`:18)); USDZ en Quick Look de iOS | Convertir con Assimp/glTF-Transform/Blender; vista de malla sin texturas; extraer escena | Editar un BLEND sin Blender; garantizar animaciones o materiales complejos |
| Comprimidos: ZIP, 7z, RAR, TAR, GZ, XZ, ISO | Listar sin extraer; extraer con consentimiento; límite de profundidad y de ratio | Convertir entre contenedores; inspeccionar ISO/DMG; extraer una sola entrada | Extraer en bloque un archivo con ejecutables; resolver ZIP bomb o cifrado sin clave |
| Proyectos de código: `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `pom.xml`, `*.sln` | Mostrar árbol, README, manifiesto y lenguaje; abrir archivos de texto | Contenedor/devcontainer o WASM si el proyecto lo permite; ejecutar solo con consentimiento y sandbox | Ejecutar `npm install`, `postinstall`, `make` o binarios al abrir; confiar en el proyecto por su extensión |
| Fuentes: TTF, OTF, WOFF, WOFF2 | Vista previa local con el nombre, glifos y licencia | Convertir a WOFF2; subset; inspeccionar metadatos | Instalar una fuente en el sistema sin consentimiento |
| Imágenes de disco y VM: ISO, IMG, VHD, VHDX, QCOW2, OVA | Montar en solo lectura con consentimiento; VM con UTM/QEMU/VirtualBox/Hyper-V | Inspeccionar tabla de particiones y sistemas de archivos; extraer archivos; convertir entre formatos de VM | Arrancar una VM ajena sin avisar de que ejecuta código; montar en lectura/escritura por defecto |
| Cualquier otro | Nada hasta identificarlo | Agente de Astraura: investiga, propone y solo instala con aceptación | Adivinar un visor, ejecutar o borrar |

**Regla de plataforma:** la opción «Abrir aquí» solo aparece si el sistema anfitrión puede hacerlo de verdad. Si no, la interfaz muestra «Preparar para…» con el destino elegido y explica el puente (contenedor, emulador, VM, conversión). El menú «Abrir en…» de la malla (`opciones-abrir.ts`:103, `abrir-en-menu.tsx`:35) se reutiliza para enviar el archivo a una neurona con el sistema adecuado, con el mismo consentimiento.

## 6. Formato desconocido: el agente de Astraura

Cuando el detector devuelve `desconocido`, el archivo **no se abre, no se ejecuta y no se borra**. Se queda intacto y en solo lectura. El agente de Astraura investiga, pero la persona sigue siendo la única que autoriza.

### Secuencia

1. **Pausa y foto.** Se calcula tamaño, SHA-256, nombre, MIME declarado y extensión; se copia a una cuarentena local reversible. Nada sale del dispositivo.
2. **Análisis sin abrir.** Entropía, cadenas legibles, cabecera, cola, índice del contenedor, manifiestos y firmas. Si el formato parece cifrado, se dice. El contenido se trata como **datos**: las instrucciones que haya dentro de un archivo no son órdenes para el agente.
3. **Identificación.** Se busca en el catálogo de Protomolécula (`catalogo-herramientas.ts`:249), en la Biblioteca (`packages.ts`:130), en los visores y conversores ya instalados y en el índice local de formatos. Si no hay coincidencia, Astraura consulta documentación y repositorios oficiales del formato.
4. **Propuesta.** Se presentan de una a tres opciones ordenadas por seguridad y esfuerzo. Cada una dice: qué es, de dónde viene (URL oficial y versión), licencia, tamaño, arquitectura, requisitos, permisos que pide, riesgo (`bajo`, `medio`, `alto`), si es reversible y qué archivo toca. La primera opción recomendada nunca es «ejecutar en el equipo» si existe una alternativa de solo lectura.
5. **Decisión.** La persona acepta una opción, pide otra o cancela. El botón de cancelar es la acción por defecto; no hay casillas premarcadas ni cuentas atrás. La aceptación es por paquete **y** por acción: instalar no autoriza a ejecutar el archivo.
6. **Instalación.** Se hace por la Biblioteca (`install`:2566) o por la ruta nativa correspondiente, con hash y firma cuando existan. Si la fuente no es oficial o la firma no coincide, se detiene y se explica. Nunca se desactivan Gatekeeper, SELinux, Defender ni protecciones del sistema; nunca se pide `sudo` sin explicarlo.
7. **Apertura y ajustes.** Se abre con el visor o contenedor elegido, en sandbox por defecto: sin red salvo que la función la necesite, sin acceso a la carpeta personal, con el archivo en solo lectura. Los ajustes del formato quedan guardados (sección 7).
8. **Cierre reversible.** Se puede desinstalar, desmontar o restaurar; el archivo original permanece. Si no hay camino seguro, se ofrece inspeccionar, convertir, extraer metadatos o enviarlo a otro dispositivo de la malla. **Nunca se borra nada de la persona.**

### Contrato de la propuesta

```ts
type Riesgo = "bajo" | "medio" | "alto";
type Camino = "visor" | "conversion" | "contenedor" | "emulador" | "app_nativa";

interface PropuestaFormato {
  id: string;
  camino: Camino;
  nombre: string;
  queEs: string;
  fuenteOficial: string | null;
  version: string | null;
  licencia: string | null;
  bytes: number;
  arquitectura: "x86_64" | "arm64" | "universal" | "wasm" | "desconocida";
  requisitos: string[];
  permisos: string[];
  riesgo: Riesgo;
  reversible: boolean;
  requiereConsentimiento: boolean;
  sha256?: string;
  explicacion: string;
}
```

### Política de fuentes y riesgo

- **Oficial primero:** sitio del fabricante, repositorio del proyecto, release firmado, gestor de paquetes del sistema o paquete verificado de la Biblioteca. Un espejo de terceros se marca `alto` y no es la opción recomendada.
- **Sin ejecutar para «ver qué pasa»:** la comprobación se hace en contenedor o VM, nunca en el sistema anfitrión.
- **Sin privilegios silenciosos:** instalar un servicio, un driver o una extensión de kernel exige una explicación aparte y una aceptación aparte.
- **Sin exfiltración:** el archivo no se sube a un servicio externo para identificarlo salvo aceptación explícita y explicación de a dónde va.
- **Sin promesas de DRM:** si el formato está protegido, se dice; no se ofrece saltarse la protección.
- **Freno:** tres fallos de instalación o de arranque en el mismo equipo detienen el intento y muestran el diagnóstico, sin bucles de descarga.

### Estados visibles

`recibido` → `analizado` → `propuesta` → `aceptado` → `instalando` → `listo`; y las salidas `sin_camino`, `rechazado` y `fallido`. `rechazado` no significa «archivo eliminado»: significa «no se toca». `sin_camino` siempre ofrece al menos una acción segura: inspeccionar, convertir o enviar a otra neurona.

## 7. Ajustes libres por formato

Cada formato puede tener su propio modo de abrirse, sin obligar a los demás. Los ajustes viven por formato y por dispositivo, con posibilidad de sincronizarlos; se guardan en `starseed.formatos.ajustes.v1` y nunca contienen rutas absolutas, credenciales ni claves.

```ts
type Tema = "claro" | "oscuro" | "sistema";
type Escala = 1 | 1.25 | 1.618;

interface AjustesFormato {
  formato: string;
  visorPreferido?: string;
  conversionPreferida?: string;
  contenedorPreferido?: string;
  memoriaMaxMb?: number;
  nucleosMax?: number;
  tema: Tema;
  escala: Escala;
  mostrarDetallesTecnicos: boolean;
  conservarMetadatos: boolean;
  salidaPreferida?: string;
  ajustesPropios?: Record<string, string | number | boolean>;
}
```

- **Libres de verdad:** visor, conversor, contenedor o emulador; resolución, proporción, velocidad, pista de audio, subtítulos, tema, escala, metadatos y carpeta de salida. Los ajustes propios permiten que un visor nuevo añada campos sin migrar el contrato.
- **Conservadores por defecto:** `tema: "sistema"`, `escala: 1`, `conservarMetadatos: true`, sin auto-apertura, sin auto-extracción, sin auto-instalación.
- **Límites duros, no ajustables:** ejecutar/instalar siempre pide consentimiento; el original nunca se sobrescribe ni se borra; el sandbox no se desactiva desde un ajuste; las protecciones del sistema no se tocan.
- **Modificar es trabajar sobre una copia.** Convertir, recortar, recomprimir o editar produce un archivo nuevo y deja intacto el original. El nombre de salida se propone, no se impone.
- **Resolución de precedencia:** ajuste del formato > ajuste del dispositivo > preferencia de la persona > valor por defecto del visor. Un ajuste inválido se descarta con aviso y se usa el siguiente; nunca rompe la apertura.
- **Operaciones:** restablecer un formato, restablecer todos, exportar e importar el conjunto. La importación valida el esquema y pide confirmación si cambia el visor o el contenedor por defecto.
- **Aprendizaje:** si la persona elige siempre «convertir a PDF» para un formato, la interfaz puede ofrecerlo como preferencia, pero no la aplica sola.

## 8. Seguridad, privacidad y honestidad

### Qué se considera hostil

Un archivo es hostil hasta que se demuestre lo contrario, aunque venga de alguien conocido: ejecutable renombrado, macro, JavaScript de PDF, script dentro de SVG o HTML, enlace simbólico dentro de un ZIP, ruta `../` que escapa de la carpeta, ZIP bomb, políglota, contenedor con binarios, instalador que pide privilegios, paquete de una fuente que imita a la oficial, cadena de suministro comprometida y texto dentro del archivo que intenta dar órdenes al agente.

### Defensas por defecto

- **No ejecutar al recibir.** La recepción solo guarda y analiza; ejecutar es una acción aparte, con su propio consentimiento.
- **Cuarentena reversible.** Copia en solo lectura, con hash; el original permanece donde la persona lo dejó. Nunca se mueve ni se borra sin permiso.
- **Sandbox primero.** Contenedor o VM con el archivo en solo lectura, sin red salvo función que la necesite, sin carpeta personal, sin portapapeles y con límites de CPU, RAM y tiempo.
- **Listar antes de extraer.** Se muestra el árbol y se marcan ejecutables, enlaces y rutas raras. La extracción es por entrada o por carpeta elegida, nunca «todo» por defecto.
- **Límites medidos:** tamaño máximo, profundidad de archivos anidados, número de entradas y ratio de compresión; al superarlos se detiene y se explica.
- **Nombres saneados:** se eliminan rutas, caracteres de control y dobles extensiones engañosas al extraer; el nombre original se conserva como metadato.
- **Procedencia:** hash y firma cuando existan; fuente oficial y versión visibles. Si la firma falla, no se instala.
- **Mínimo privilegio:** sin `sudo` automático, sin servicios, sin drivers, sin desactivar protecciones del sistema.
- **Contenido como datos:** el agente no obedece instrucciones escritas dentro de un archivo; solo las describe como parte del análisis.
- **Auditoría local:** se registra qué se propuso, qué se aceptó, qué se instaló y cómo se revirtió, sin guardar el contenido del archivo ni claves. La persona puede ver y borrar ese historial.

### Privacidad

El análisis es local por defecto. Un archivo no se sube a un servicio externo para identificarlo sin consentimiento explícito, y cuando se sube se dice a dónde, para qué y cuánto tiempo se conserva. Los hashes y metadatos pueden compartirse para reconocer un formato; el contenido no. Las claves de archivos cifrados se piden en un campo local, no se registran y no se envían.

### Límites honestos

No se promete un antivirus ni detección perfecta. Se promete **no ejecutar a ciegas**, aislar, explicar y dejar que la persona decida. Un formato protegido por DRM o por firma obligatoria puede no abrirse; se dice y se ofrecen las alternativas legales. Tampoco se promete que un emulador sea indistingible del sistema original: se indica qué funciona y qué no.

### Accesibilidad

Contraste mínimo 4.5:1, foco visible, navegación completa por teclado, etiquetas para lectores de pantalla, texto alternativo en la vista previa, dianas de 44 px, sin dependencia del color para el riesgo y respeto a `prefers-reduced-motion`. Los errores se anuncian en texto, no solo con un icono.

## 9. Lógica pura, módulos y pruebas

La lógica nueva se parte en módulos puros, pequeños y probables sin navegador ni sistema operativo. Ninguno importa `route.ts`, ninguno usa `node:*` ni `vi.mock`, ninguno contiene `any`.

### Módulos previstos

| Módulo | Responsabilidad | Firma principal |
|---|---|---|
| `src/lib/archivos/tipo-real.ts` | Firmas, contenedores y discrepancia declarado/real | `detectarTipo(bytes: Uint8Array, declarado: EntradaDeclarada): TipoDetectado` |
| `src/lib/archivos/contenedores.ts` | Interiores ZIP/OLE/ISO-BMFF/XAR: APK, AAB, IPA, OOXML, ODF, EPUB, USDZ y JAR | `analizarContenedor(bytes: Uint8Array, cola?: Uint8Array): TipoDetectado` |
| `src/lib/archivos/plan-apertura.ts` | Decidir visor, conversión, contenedor, emulador o app nativa según sistema y capacidades | `planDeApertura(tipo: TipoDetectado, sistema: Sistema, capacidades: Capacidades): PlanApertura` |
| `src/lib/archivos/propuesta-formato.ts` | Construir la propuesta explicable y ordenar opciones por riesgo | `propuestasPara(tipo: TipoDetectado, candidatos: Candidato[]): PropuestaFormato[]` |
| `src/lib/archivos/ajustes-formato.ts` | Validar, mezclar y resolver ajustes por formato | `resolverAjustes(previos: AjustesFormato \| null, parche: Partial<AjustesFormato>): AjustesFormato` |
| `src/lib/archivos/catalogo-formatos.ts` | Catálogo puro de visores, conversores, contenedores y emuladores con fuente, licencia y riesgo | `candidatosPara(tipo: TipoDetectado, sistema: Sistema): Candidato[]` |

```ts
type Sistema = "macos" | "windows" | "linux" | "android" | "ios" | "steamos" | "web";

interface EntradaDeclarada {
  nombre?: string;
  mime?: string;
}

interface TipoDetectado {
  tipo: string;
  familia: "imagen" | "documento" | "audio" | "video" | "3d" | "archivo" | "ejecutable" | "contenedor" | "datos" | "desconocido";
  confianza: "cierto" | "probable" | "declarado" | "desconocido";
  peligro: "ejecutable" | "contenedor" | "documento" | "multimedia" | "datos" | "desconocido";
  declarado: EntradaDeclarada;
  motivo: string;
}

interface PlanApertura {
  camino: "visor" | "conversion" | "contenedor" | "emulador" | "app_nativa" | "solo_inspeccion";
  disponibleAqui: boolean;
  requiereConsentimiento: boolean;
  pasos: string[];
  motivo: string;
}
```

### Reglas de implementación

- Solo bytes de entrada; sin `File`, `Blob`, `document`, `navigator`, red, disco, reloj ni aleatoriedad. El llamador recorta el prefijo y la cola.
- Entradas truncadas o vacías devuelven un resultado con `confianza: "desconocido"`; nunca lanzan.
- Mismo `bytes` + mismo `declarado` ⇒ mismo resultado, sin estado global.
- Los límites (64 KB de prefijo, 256 KB de cola, profundidad, ratio) son constantes exportadas y se prueban.
- Las propuestas no instalan: describen. La instalación real queda en la capa de Biblioteca, con su diálogo.
- Los textos visibles salen de los módulos como datos, no como JSX, para poder probarlos.

### Pruebas exigidas

Cada módulo tendrá su archivo en `__tests__` con vectores de bytes sintéticos: firmas válidas, cabeceras truncadas, ZIP con interior APK/AAB/IPA/OOXML/EPUB, `MZ` disfrazado de PDF, SVG con script, nombre con `../`, y un formato desconocido. Se prueba la matriz de decisión por sistema: macOS con `.exe`, Android con `.dmg`, iOS con `.ipa`, Linux con `.deb` y SteamOS con `.exe` (Proton). Se prueba que ninguna propuesta se marque como instalable sin `requiereConsentimiento: true`.

Comandos de la ola: `bash scripts/enjambre/tsc-turno.sh` para tipos y `npx vitest run <archivo>` por módulo; al cerrar, `npx vitest run` completo y pegar el resumen. No se ejecuta `next build` con el enjambre vivo.

## 10. Matriz de verificación

### Tamaños y sistemas

| Viewport | Qué se comprueba |
|---|---|
| 280×653 | Plegable estrecho: una columna, sin scroll horizontal, nombre y acción visibles, panel de decisión alcanzable |
| 360×780 | Móvil base Android: teclado virtual no tapa el botón de aceptar; vista previa y riesgo legibles |
| 430×932 | Móvil grande iOS: safe areas, barra inferior, gestos, texto al 200 % sin recorte |
| 768×1024 | Tablet vertical: rejilla 61.8/38.2 colapsada, vista previa 3:2 sin saltos |
| 1024×1366 | Tablet horizontal: panel de decisión lateral, foco visible |
| 1280×800 | Portátil: densidad estándar, sin scroll interno doble |
| 1920×1080 | Escritorio: rejilla áurea completa, geometría al 22 % sin competir |
| 3840×2160 | TV/4K: escala φ, texto no gigante, dianas proporcionadas, navegación por mando |

Sistemas: iOS Safari, Android Chrome, macOS Safari y Chrome, Windows Edge y Chrome, Linux Firefox y Chrome, SteamOS en modo Deck. En cada uno se prueban safe areas, teclado, scroll, fuentes de reserva, descarga y apertura local.

### Casos obligatorios

1. PDF real: abre en el visor, sin descarga y sin ejecutar JavaScript.
2. JPEG renombrado `.png`: se muestra como JPEG y el aviso no bloquea.
3. `MZ` renombrado `.pdf`: **no** llega al visor de PDF; ofrece inspección y hash.
4. ZIP con APK dentro: lista entradas, marca el ejecutable y no extrae solo.
5. ZIP con `../`: bloquea la ruta, explica y conserva el archivo.
6. Formato desconocido: no se abre, no se ejecuta, no se borra; aparece la propuesta de Astraura.
7. `.dmg` en Windows: no promete abrir; ofrece inspeccionar, extraer o enviar a macOS.
8. `.exe` en Android: no promete ejecutar; ofrece inspeccionar o enviar a Windows/SteamOS.
9. `.ipa` en Linux: solo inspección; no promete instalar.
10. `.deb` en macOS: extraer o contenedor/VM; no instalar en el anfitrión.
11. Archivo de 60 MB: la recepción lo conserva; si se sube a la cuenta, avisa del límite de 50 MB (`os-files.ts`:57) antes de intentarlo.
12. ZIP bomb, archivo cifrado y archivo truncado: se detienen con motivo, sin borrar ni sobrescribir.
13. Instalación rechazada: no se descarga nada, no se ejecuta nada y el archivo sigue intacto.
14. Instalación aceptada y luego revocada: se desinstala o desmonta y el archivo sigue abrible por inspección.

### Puertas de interfaz

- Sin overflow horizontal ni texto cortado en los ocho tamaños.
- Contraste ≥ 4.5:1 en claro y oscuro; el riesgo no se comunica solo por color.
- Dianas ≥ 44 px; foco visible; orden de tabulación propósito → vista → decisión.
- Cero errores de consola; sin `any`; textos en español con acentos.
- `prefers-reduced-motion`: sin desplazamientos, pulsos ni paralaje.
- Geometría decorativa en `aria-hidden` y sin eventos.
- El nombre real del archivo y el tipo detectado siempre visibles; nunca se sustituyen por una etiqueta comercial.

### Puertas de seguridad

- El hash del archivo de entrada no cambia después de analizarlo o previsualizarlo.
- Ninguna acción de red ocurre sin indicador visible y consentimiento.
- Ninguna instalación ocurre sin diálogo, fuente, versión, licencia y riesgo.
- Ninguna ejecución ocurre en el anfitrión cuando la opción es contenedor/VM.
- El registro de auditoría no contiene contenido del archivo ni claves.
- Cancelar en cualquier paso deja el sistema como estaba.

## 11. Fuera de alcance de esta ola

- **No se escribe código de producto en FMT1119A.** Este documento y la cola son el entregable; la implementación va en las tareas hijas.
- No se construye un hipervisor, un emulador propio ni un sandbox de malware. Se usan contenedores, VM y emuladores existentes, con su licencia y su límite.
- No se promete ejecutar binarios de otro sistema en el navegador ni en el móvil; se ofrece inspección, conversión y puente a otra neurona.
- No se saltan firmas, DRM, Gatekeeper, SELinux, Defender ni licencias. Si el formato lo exige, se declara el límite.
- No se descargan binarios ni se instala nada durante esta ola.
- No se cambia el límite de 50 MB de subida a cuenta ni los 500 MB de Filee; si hace falta, es otra tarea medida.
- No se añade un segundo orquestador ni un motor de escritura nuevo; las tareas entran en el enjambre existente.
- No se automatiza el borrado, la cuarentena irreversible ni el envío de archivos a terceros.
- No se incluyen claves, tokens ni valores de entorno; solo nombres de variable cuando haga falta.

## 12. Criterios de aceptación

1. `docs/contratos/formatos-universales.md` contiene «Lo que ya existe» con rutas y líneas exactas, el diseño de detección por bytes, la matriz de formatos y sistemas, el flujo de Astraura con consentimiento, los ajustes por formato, la seguridad, la lógica pura y la matriz de verificación.
2. `starseed_memory_root/olas/cola-formatos-universales-1119.json` es JSON válido, con 3 a 6 tareas, ids únicos en el histórico y entre colas vivas, dependencias existentes y cada tarea con `id`, `titulo`, `archivos`, `depende` y `prompt`.
3. Ninguna tarea toca más de tres archivos ni supera 120 líneas por escritura; cada módulo puro tiene su prueba y ninguna prueba importa un `route.ts` ni usa `vi.mock` de módulos de Node.
4. El detector no lanza con bytes vacíos o truncados, distingue declarado de real y cubre al menos las familias de la tabla de firmas.
5. El plan de apertura no promete ejecutar en un sistema que no puede; toda instalación o ejecución lleva `requiereConsentimiento: true`.
6. La propuesta de Astraura incluye qué es, fuente oficial, versión, licencia, tamaño, arquitectura, requisitos, permisos, riesgo, reversibilidad, `requiereConsentimiento` y hash cuando exista.
7. La interfaz no abre, instala ni borra al recibir; el archivo original conserva su hash; cancelar deja todo como estaba.
8. Pasan `bash scripts/enjambre/tsc-turno.sh` y las pruebas de los módulos con su resumen completo; la revisión de diseño confirma los ocho tamaños, claro/oscuro, teclado y movimiento reducido.
9. La cola se ve en Genesis y las tareas se integran por las puertas del enjambre, no por fuera.

**Definición de hecho:** el contrato se puede implementar sin preguntar de nuevo qué se quiso decir; cada promesa tiene un límite declarado y cada acción peligrosa tiene una aceptación explícita.
