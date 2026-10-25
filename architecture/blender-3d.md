# Blender como medio 3D autoadaptable del OS (contrato · BLD1025A · 2026-10-25)

> Petición de Alex (2026-10-25), literal: «instala blender para las escenas 3d tanto de nosotros como en todo el os
> de la protomolecula y astraura y todos los medios de edicion y desarrollo 3d autoadaptable».
>
> Este documento es el **contrato**: qué es Blender para el OS, cómo se detecta en cada neurona, qué hace cada medio,
> cómo se pide un trabajo 3D sin ejecutar nunca código libre, y qué garantías de seguridad y licencia se mantienen.
> La cola del enjambre que lo construye es `starseed_memory_root/olas/cola-blender-1025.json` (ids `BLD1025B…K`).
> Antecedentes que se leen primero: `architecture/protomolecula.md` §3.2 y §8, `architecture/protomolecula-catalogo.md`
> (Blender ya está en el catálogo, categoría «Modelado, escultura y 3D»), `architecture/conversion-archivos.md`
> (el patrón de «programa externo por línea de órdenes», que aquí se repite), `architecture/astraura-avatares-3d.md`
> §11 y `servicios/taller-3d/README.md` (el taller 3D ya llama a Blender sin ventana para remallar y convertir),
> `architecture/starseed-xr.md` §0 y `architecture/repos-3d-oido-agentes-1023.md` §3.

## 0 · Reglas que mandan (de `CLAUDE.md`; no se negocian)

1. **Blender es un MEDIO, nunca una dependencia.** Todo lo 3D del OS tiene que seguir funcionando sin Blender (three.js
   en el navegador). Blender suma: edición completa, render de calidad y lotes en cola.
2. **GPL fuera del paquete.** Blender corre como programa aparte, en un proceso hijo, lanzado por lista de argumentos
   (`execFile`/`subprocess` sin shell). No se importa `bpy` en ningún sitio del repo ni se copia código suyo (§7.1).
3. **Editable sí, ejecutable no.** Un trabajo 3D es un DATO con vocabulario cerrado. El guion de Blender lo genera una
   función pura SOLO desde una lista blanca de operaciones con valores validados; nunca se ejecuta código libre de una
   persona, de una IA ni de un complemento sin revisión (`architecture/protomolecula.md` §8.2: la IA PROPONE, la persona
   acepta con la mano).
4. **Honestidad:** lo que aún no corre se escribe «próximamente: <motivo>». Una neurona sin Blender no finge renderizar.
5. **Nada de `node:*` en código de cliente** (`CLAUDE.md`, trampa 11): lo puro va en `src/lib/blender3d/trabajo.ts`; la
   lectura de disco y los procesos, en un archivo solo de servidor.
6. **Tareas del enjambre ≤ 3 archivos y ≤ 120 líneas por archivo.** Claves solo por NOMBRE de variable; nunca en el guion.
7. **Toda repo o modelo que Alex trae entra en la Biblioteca con comprobación de versión** (`CLAUDE.md`, economía). La ficha
   `repo-blender` se añade en este mismo commit (`src/lib/library/repos-os.ts`), «próximamente» hasta que corra (§9).

## 1 · Lo averiguado (2026-10-25, con enlaces)

### 1.1 Versión

| Dato | Valor | Fuente |
|---|---|---|
| Última estable | **Blender 5.2.3 LTS**, 22-10-2026 (etiqueta `v5.2.3`, 21-10-2026) | [descargas](https://www.blender.org/download/), [lista de archivos 5.2](https://download.blender.org/release/Blender5.2/), [etiquetas en projects.blender.org](https://projects.blender.org/blender/blender/tags) |
| Parches de la serie | 5.2.0 (14-07), 5.2.1 (25-08), 5.2.2 (15-09), **5.2.3 (22-10)** | [5.2 LTS](https://www.blender.org/releases/5-2/) |
| Soporte LTS | 2 años: 5.2 «supported until July 2028». Convive con la 4.5 LTS (`v4.5.15`, 21-10-2026) | [5.2 LTS](https://www.blender.org/releases/5-2/), [ciclo de versiones](https://developer.blender.org/docs/handbook/release_process/release_cycle/) |
| Lo instalado en este contenedor | **5.2.0 LTS** (compilación 14-07-2026, hash `fbe6228777e7`): **tres parches atrás** | `blender --version` aquí |

El hash de compilación de Blender (`bpy.app.build_hash`) ES el commit de la etiqueta: `fbe6228777e7` = `v5.2.0`, comprobado con
`git ls-remote --tags` en [github.com/blender/blender](https://github.com/blender/blender) (espejo oficial) y en
[projects.blender.org](https://projects.blender.org/blender/blender): mismas etiquetas y mismos SHA. Sirve para que la detección
diga «5.2.0 exacta» sin adivinar.

**Decisión de serie:** fijar la **5.2 LTS** (acepta cualquier 5.2.x). Mínimo aceptado para lotes: 4.0 (es lo que trae Ubuntu 24.04,
ver §1.3); el vocabulario v1 solo usa operaciones que existen en 4.0 y en 5.2 y se prueba en las dos (§5).

### 1.2 Licencia: qué implica la GPL

- Blender es **GPL-3.0-or-later**. StarSeed OS es **AGPL-3.0-or-later** (`LICENSE`, `package.json`). La GPLv3 permite combinar con
  la AGPLv3 (cláusula 13), así que no hay incompatibilidad; aun así **no se enlaza**: pesa 1,2 GB instalado (aquí) y 346 MB de
  descarga, Vercel tiene tope de 250 MB por función (`CLAUDE.md`) y un proceso aparte es la forma más simple de no mezclar código.
- Lo que la persona crea es suya: «What you create with Blender is your sole property» ([licencia](https://www.blender.org/about/license/)).
  La API de Python es parte de Blender: un guion que se **publique** debe ser GPL-compatible. Los nuestros son AGPL (compatible) y
  no se redistribuyen con Blender.
- El módulo [`bpy` de PyPI](https://pypi.org/project/bpy/) (5.2.3, 22-10-2026) es **GPL-3.0**, exige `Python ==3.13.*` y sus ruedas
  son: `manylinux_2_28_x86_64` (402,8 MB), `macosx_11_0_arm64` (245,2 MB), `win_amd64` (339,6 MB) y `win_arm64` (210,6 MB). **No hay
  rueda para Linux aarch64** (el A1) ni para Mac Intel. Decisión: **no se usa `bpy` como librería**; solo el ejecutable en un proceso
  hijo (en el A1 no existiría y en la Mac obligaría a un Python 3.13 aparte).
- La marca y el logo de Blender son de la Blender Foundation: el OS nombra el programa, no usa su logo como propio. (Revisar la
  política de marca en su sitio antes de poner un icono suyo en una superficie; no la he verificado.)

### 1.3 Dónde corre cada build

| Medio | Qué hay | Detalle |
|---|---|---|
| **macOS arm64 (la Mac de Alex, M1)** | Oficial: `blender-5.2.3-macos-arm64.dmg`, **346 295 881 B** (346 MB; la página dice «330 MB»), macOS 13+ | Cask de Homebrew `blender` = **5.2.3**, instala `/Applications/Blender.app` y el comando `blender` (envoltorio en `$HOMEBREW_PREFIX/bin`), SHA-256 `acc05374485a272342d4b323c15ac01953e7f697da2f1bad8af9c3bf087267a4` ([cask](https://formulae.brew.sh/cask/blender)). Tamaño instalado en macOS: no medido (en Linux son 1,2 GB). El disco de la Mac va justo. |
| **Linux x86_64** | Oficial: `blender-5.2.3-linux-x64.tar.xz`, 385 MB, glibc 2.28+ | Es el que hay en este contenedor (`/opt/blender-5.2.0-linux-x64`, 1,2 GB en disco). |
| **Linux ARM64 (el A1 de Oracle: Ubuntu 24.04 aarch64, 2 OCPU, 12 GB)** | **No hay build oficial**: la página de descargas y `download.blender.org/release/Blender5.2/` solo traen Linux x64; el equipo de Blender dijo en 2024 que «no hay planes concretos» ([hilo](https://devtalk.blender.org/t/blender-for-linux-arm64-with-denoise/31331)). Tampoco rueda `bpy` ni Flathub (solo x86_64, [Flathub](https://flathub.org/apps/org.blender.Blender)). | Opciones reales de la distro: **Ubuntu 24.04 «noble»: Blender 4.0.2** en `universe` ([Launchpad](https://api.launchpad.net/devel/ubuntu/+archive/primary?ws.op=getPublishedSources&source_name=blender&status=Published)); Debian trae arm64 en trixie (4.3.2), forky (5.0.1) y sid (**5.2.2**) ([madison](https://qa.debian.org/madison.php?package=blender&table=debian&text=on)); Alpine edge aarch64 tiene `blender-headless` **5.2.2-r2** ([Alpine](https://pkgs.alpinelinux.org/packages?name=blender*&branch=edge&arch=aarch64)), que sirve dentro de un contenedor musl. Compilar Blender en 2 OCPU no compensa. **No he podido probar ninguna en un arm64**: la primera comprobación real es la tarea BLD1025E en el A1. |

Consecuencia de diseño: el A1 puede acabar con Blender **4.0.x** (apt) mientras la Mac tiene 5.2.x. Por eso el generador de guiones conoce la
versión de Blender y el vocabulario v1 se limita a lo común (§5.4).

### 1.4 Render sin pantalla: medido aquí

Contenedor de pruebas: x86_64, **2 núcleos**, 8 GB de RAM, sin GPU. Blender 5.2.0, `blender -b --factory-startup --python-expr …`, escena
con un cubo, una cámara y un sol, 256×256:

| Qué | Resultado |
|---|---|
| Cycles CPU, 8 muestras, PNG | **4,19 s** en total (3,36 s de render), **pico 434 MB**, PNG de 34 944 B |
| Exportar GLB (`export_scene.gltf`) | **0,055 s**, GLB de 1 728 B (cubo + cámara) |
| Workbench, PNG | **1,52 s** en total |
| EEVEE sin GPU | **funciona** (código de salida 0, PNG de 29 857 B) pero por GL de software con errores `EGL_BAD_MATCH` y tarda **35–59 s** para 256×256: **no se usa EEVEE en neuronas sin GPU** |
| Arranque en frío de `blender -b` | 0,7 s |
| Con `--factory-startup` | `use_online_access = False` y `use_scripts_auto_execute = False` (autoexec apagado, es el valor por defecto en 5.2: `-Y`) |
| Cycles: dispositivos | `get_device_types` = CUDA, OptiX, HIP, oneAPI (Linux); en la lista de dispositivos solo la CPU. En Mac sería Metal (**no verificado aquí**) |
| Construido con | FFmpeg (MP4/MKV/WebM), USD, OpenEXR, WebP, Alembic, OpenXR, `io_fbx`, `io_wavefront_obj`, `io_ply`, `io_stl`, `mod_remesh`; el importador de SVG a curvas existe |

Banderas de línea de órdenes que se usan (de `blender --help`, 5.2.0): `-b`, `--factory-startup`, `--python <archivo>`,
`--python-exit-code <0..255>` (código de salida si hay excepción), `--threads`, `-Y/--disable-autoexec` (ya es el valor por defecto),
y **no** `--python-use-system-env` ni `--python-use-user-env` (rompen el aislamiento del Python de Blender).

### 1.5 glTF/GLB para three.js

- El exportador de Blender escribe `.glb` y `.gltf` ([manual](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html)),
  con +Y arriba (`export_yup`), aplicar modificadores (`export_apply`), compresión Draco (`export_draco_mesh_compression_enable`) y
  meshopt (`export_meshopt_compression_enable`, opciones comprobadas en 5.2.0). Estándar: glTF 2.0, [especificación de Khronos](https://registry.khronos.org/glTF/).
- three.js lo carga con [`GLTFLoader`](https://threejs.org/docs/pages/GLTFLoader.html); los GLB comprimidos exigen registrar
  `DRACOLoader`, `MeshoptDecoder` o `KTX2Loader` antes. **Decisión v1: GLB sin comprimir por defecto**; Draco/meshopt solo si el destino
  declara que trae el descodificador (el optimizador `servicios/taller-3d/optimizar.mjs` ya existe para eso). El OS ya carga GLB en
  `src/components/vivo/espacial/cargar-modelo.ts`, `avatar-vivo.tsx` y la orbe 4D (`orbe4d/motor.ts`).

### 1.6 Puentes para agentes: ahujasid/blender-mcp

Fuente: el [repositorio](https://github.com/ahujasid/blender-mcp) (hoy se presenta como «MCP for Blender», `mcp-for-blender`), la API de GitHub
y PyPI.

- **Licencia MIT.** Último empuje 16-08-2026, ~26 000 estrellas. En PyPI: `mcp-for-blender` 2.2.4 y `blender-mcp` 2.0.0. No dice que soporte
  Blender 5 (declara «3.0 o más»); no está probado con 5.2 ni por nosotros.
- **Cómo funciona:** un complemento (`addon.py`) abre **un servidor de sockets TCP dentro de Blender** (`localhost:9876`, configurable) y un servidor MCP
  (`uvx mcp-for-blender`) traduce las herramientas del agente a mensajes JSON.
- **Herramientas:** `execute_blender_code` (**Python arbitrario dentro de Blender**), `look`, `get_scene_info`, `generate_3d`, `search_assets`,
  `import_asset`, `get_addon_status`, `disable_telemetry`, `record_trajectory_feedback`.
- **Servicios de terceros que contacta:** Poly Haven, Sketchfab, Poly Pizza, Meshy, Tripo, Hyper3D Rodin y Hunyuan3D (Tencent Cloud). La licencia de
  Hunyuan3D **excluye la UE** (`protomolecula-catalogo.md` §5): fuera.
- **Telemetría:** por defecto manda un registro anónimo mínimo (id de instalación aleatorio, herramienta, éxito, duración, versiones, SO); el contenido es
  opt-in. Se apaga con `DISABLE_TELEMETRY=true`.
- **Riesgos que su README reconoce:** el socket **no tiene autenticación ni cifrado** (cualquiera que alcance el puerto ejecuta código en Blender) y
  `execute_blender_code` ejecuta lo que le llegue; existe un modo seguro (`BLENDER_MCP_SAFE_MODE=1`) que filtra operaciones peligrosas. Su instalador
  oficial es `curl … | sh`.

**Decisión (a confirmar por Alex, §12):** el puente **no es el camino por defecto** del OS. El camino por defecto es el trabajo 3D como dato (§4), que
ya da a los agentes lo que necesitan sin código libre. El puente MCP queda como complemento **opcional, solo en el escritorio de Alex, con su visto bueno
y con tres seguros obligatorios**: puerto solo en `127.0.0.1`, `DISABLE_TELEMETRY=true` + `BLENDER_MCP_SAFE_MODE=1`, y la herramienta
`execute_blender_code` **no expuesta a ningún agente** (solo una persona delante de la pantalla puede confirmarla). Cola: `BLD1025K` (`aprobacion: true`).

## 2 · Qué es «Blender como medio» (el modelo)

Una neurona es un aparato; cada forma de abrir el OS en él es un medio (`architecture/neuronas-un-aparato.md`). Aquí se añade una **capacidad** más de la
neurona: «tengo Blender, de esta versión, y puedo hacer esto». Se publica en `neuron_devices.capabilities.blender` (sin DDL, igual que `taller3d`) y
las demás neuronas de la MISMA cuenta la usan para decidir dónde mandar un trabajo.

```
capabilities.blender = {
  v: 1, instalado: boolean, version: "5.2.0", hash: "fbe6228777e7", serie: "5.2",
  perfil: "ninguno" | "ligero" | "estandar" | "estudio",
  motores: ["workbench", "cycles-cpu", "cycles-gpu", "eevee"],   // solo los que ESTA neurona puede usar de verdad
  gpu: ["metal" | "cuda" | "optix" | "hip" | "oneapi"],            // vacío si no hay
  hilos: number, ramGB: number, ramLibreGB: number,
  formatos: { entrada: ["glb","gltf","obj","stl","ply","fbx","svg","hdr","exr"], salida: ["glb","png","exr","mp4"] },
  visto: ISO                                                       // nunca rutas absolutas ni nombre de usuario
}
```

## 3 · Detección por neurona

Módulo `servicios/blender-3d/deteccion.py` (Python estándar, `BLD1025B`). Mismo patrón de `Sistema` inyectable que `servicios/taller-3d/taller.py`
(`binario`, `ram_total_gb`), que hoy ya busca Blender para remallar.

1. **Dónde está** (por orden): `STARSEED_BLENDER` (nombre de variable; apunta a un ejecutable), `TALLER3D_BLENDER` (compatibilidad), `blender` en el
   `PATH`, `/Applications/Blender.app/Contents/MacOS/Blender`, el envoltorio de Homebrew y `/opt/blender*/blender`.
2. **Qué versión:** `blender --version` (plazo 10 s). Se extrae `5.2.0 LTS` y el `hash`. Con el hash se mira si coincide con una etiqueta conocida.
3. **Qué puede hacer** (una sola sonda, `blender -b --factory-startup --python-expr`, plazo 30 s, resultado en caché con la versión como clave): dispositivos de
   Cycles (`get_device_types` + `devices`), `bpy.app.build_options.codec_ffmpeg`, motores disponibles. Mide el arranque en frío.
4. **Dónde corre:** núcleos, RAM total y libre, ARM/x86, SO, GPU de NVIDIA por `nvidia-smi` (como el taller) y Apple Silicon por `sysctl`.
5. **Perfil** (`perfil_de`, función pura; los umbrales se calibran con medidas en BLD1025B):

| Perfil | Cuándo | Tope por trabajo (propuesta) |
|---|---|---|
| `ninguno` | no hay Blender o no arranca | no ejecuta; sigue disponible three.js |
| `ligero` | sin GPU utilizable, o RAM libre < 6 GB (el A1, esta caja) | Workbench y Cycles CPU, ≤ 1280×720, ≤ 64 muestras, ≤ 120 fotogramas, 1 trabajo a la vez, tope de memoria 2 GB |
| `estandar` | GPU (Metal/CUDA/HIP/oneAPI) o ≥ 4 núcleos y ≥ 6 GB libres | ≤ 1920×1080, ≤ 256 muestras, ≤ 300 fotogramas, tope 4 GB |
| `estudio` | GPU con ≥ 8 GB o ≥ 16 GB de RAM libres | ≤ 3840×2160, ≤ 1024 muestras, ≤ 1800 fotogramas, tope 8 GB |

   El tope de memoria real es `min(tope del perfil, 50 % de la RAM libre)` (la Mac de Alex tiene 8 GB y un enjambre escribiendo). EEVEE solo entra en `motores`
   si hay GPU; sin GPU no se ofrece (§1.4).
6. **Cuándo se vuelve a medir:** al arrancar la neurona, al cambiar `version` y cada 6 h; la parte barata (RAM libre) en cada latido. La sonda nunca bloquea el latido.

## 4 · El «trabajo 3D» como DATOS

Tipos puros en `src/lib/blender3d/trabajo.ts` (TypeScript, sin `node:*`, `BLD1025C`) y su vocabulario en **un solo archivo de datos,
`src/lib/blender3d/vocabulario.json`**, que leen tanto TypeScript (`resolveJsonModule` ya está activo) como Python (`servicios/blender-3d/` lo localiza con una ruta relativa al repo). Así la lista blanca del cliente y la del
generador no pueden desfasarse.

```
Trabajo3D = {
  v: 1,
  titulo: string (≤ 80), calidad: "borrador" | "normal" | "final",
  ambito: "personal" | "perfil" | "grupo" | "publica",
  origen: "protomolecula" | "astraura" | "estudio" | "xr" | "avatares" | "orbe" | "api",
  quien: "persona" | "agente",
  escena: Operacion[]   // ≤ 256, en orden
  salidas: Salida[]     // 1 a 4
  limites?: { segundos?: number, memoriaMB?: number }   // solo para BAJAR los del perfil, nunca subirlos
}
```

### 4.1 Lista blanca de operaciones (v1)

| `op` | Parámetros (todos validados y acotados en `vocabulario.json`) |
|---|---|
| `primitiva` | `tipo` ∈ cubo, esfera, icosfera, cilindro, cono, toro, plano, círculo · `nombre` · `tam` · `segmentos` (tope) |
| `transformar` | `objeto` · `ubicacion[3]` · `rotacion[3]` (grados) · `escala[3]` |
| `material` | `objeto` · `color` (rgba 0–1) · `metalico` · `rugosidad` · `emision{color, fuerza}` · `alfa` |
| `modificador` | `objeto` · `tipo` ∈ subdivision, bisel, solidificar, espejo, matriz, decimar, malla-alambre · parámetros por tipo con rangos |
| `texto3d` | `texto` (≤ 64 caracteres: letras, cifras, espacios y `.,:;!?¡¿'-+()`) · `extrusion` · `tam` · fuente `por-defecto` |
| `camara` | `ubicacion` · `mira_a` · `lente_mm` · `ortografica` |
| `luz` | `tipo` ∈ sol, punto, foco, area · `color` · `energia` · `ubicacion` · `rotacion` |
| `mundo` | `color` + `fuerza`, o `hdri` (referencia relativa a las entradas) + `fuerza` |
| `importar` | `archivo` relativo a `entradas/` (extensión ∈ glb, gltf, obj, stl, ply, fbx, svg) · `nombre`. **Nunca `.blend` ni `.py`** |
| `animar` | `objeto` · `propiedad` ∈ ubicacion, rotacion, escala · `claves[{fotograma, valor}]` · `interpolacion` ∈ lineal, suave, bezier |
| `remallar` | `objeto` · `modo` ∈ voxel, quadriflow · `caras`. **v1: «próximamente»**: el vocabulario la marca y el validador la rechaza con su motivo; hoy lo hace `servicios/taller-3d` y una ola posterior la absorberá |

Salidas: `render_png {ancho, alto, muestras, motor, fondo_transparente}`, `render_mp4 {ancho, alto, fps, desde, hasta, muestras, motor}`,
`exportar_glb {objetos: todos|lista, y_arriba, aplicar_modificadores, draco, meshopt}` y `render_exr`. `motor` ∈ workbench, cycles-cpu, cycles-gpu, eevee
(el perfil de la neurona recorta o rechaza lo que no pueda).

### 4.2 Reglas de validación (las mismas en TS y en Python)

- Números **finitos** y dentro del rango del vocabulario; enteros donde toca; listas con su longitud exacta.
- Nombres de objeto: `^[A-Za-z][A-Za-z0-9_-]{0,31}$`, únicos. Rutas: relativas, `^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$`, sin `..`, sin `/` inicial, extensión
  en lista; la cola copia las entradas a la carpeta del trabajo y NUNCA lee fuera de ella.
- Topes duros por trabajo (independientes del perfil): ≤ 256 operaciones, ≤ 4096 px por lado, ≤ 1024 muestras, ≤ 1800 fotogramas, ≤ 30 min, ≤ ~2 M de vértices
  estimados tras los modificadores (`estimarCoste`, función pura que usa el propio vocabulario).
- Cualquier campo desconocido → rechazo con el motivo en español (no se ignora en silencio).

### 4.3 Del dato al guion (`servicios/blender-3d/generador.py`, `BLD1025D`)

1. `generar_guion(trabajo, version_blender) -> str` es **pura**: cada operación se convierte en UNA llamada a una función de un módulo fijo de Blender
   (`servicios/blender-3d/ops_starseed.py`, escrito por nosotros, con su SHA-256 en la procedencia). **Comprobado aquí:** Blender 5.2 con `-P` NO añade a
   `sys.path` ni la carpeta del guion ni la actual, así que el guion abre con `sys.path.insert(0, ".")` (la única sentencia de ese tipo que el
   verificador admite; sin rutas absolutas, así el guion es idéntico en todas las máquinas) y el ejecutor lanza Blender con la carpeta del trabajo como directorio
   actual y copia allí `ops_starseed.py`; no se usa `--python-use-system-env` con argumentos literales ya validados (`repr` de números y enumeraciones; los textos libres pasan por
   `json.dumps`). No hay interpolación de cadenas libres dentro de código.
2. **Segunda barrera, `verificar_guion(src)` (en `servicios/blender-3d/barreras.py`, junto al validador Python):** analiza el guion con `ast` y solo admite `import sys`, `import ops_starseed as o` (y `bpy`, `math`, `json`), UNA sentencia `sys.path.insert(0, ".")`, llamadas a `o.<operación de la lista blanca>(...)` con
   argumentos constantes. Rechaza cualquier otro `import`, `exec`, `eval`, `compile`, `open`, `__import__`, atributos con `__`, `os`, `subprocess`, `socket`, `urllib`, `getattr`.
   Una prueba de contrato lo ataca con textos de inyección (`"); import os; …`, saltos de línea, comillas, unicode) y comprueba que o se rechaza o queda como texto inerte.
3. El guion se guarda en la carpeta del trabajo con su **SHA-256** (va en la procedencia). Mismo trabajo + misma versión → mismo guion, byte a byte.
4. El nombre interno del motor EEVEE cambia con la serie (5.2 aquí: `BLENDER_EEVEE`; 4.2–4.5: `BLENDER_EEVEE_NEXT`; 4.0: `BLENDER_EEVEE`): lo resuelve `ops_starseed` al ejecutar,
   buscando entre los que Blender ofrece, y no hay tabla de versiones que se desfase. `version_blender` va en la cabecera del guion (y en su SHA-256). Las pruebas reales corren en 5.2 aquí y en 4.0 en el A1.

### 4.4 Quién pide y quién decide

La IA (Astraura, un agente de la Protomolécula) **propone un `Trabajo3D`**, nunca código. El validador decide si cabe en el vocabulario. Un trabajo que cabe en el perfil
y en los topes de «borrador/normal» puede encolarse solo; uno más pesado, con `importar` de archivos de otra persona, o en ámbito `grupo`/`publica` pide **confirmación humana**
(`permisos.ts#decidir`, mismas reglas que `lanzar-externo`). Un guion `.py` externo o un complemento nuevo es un **candidato** (diff legible, sin ejecutar) que una persona acepta.

## 5 · Qué hace cada medio

| Medio | Qué hace | Cómo |
|---|---|---|
| **Escritorio con Blender** (Mac de Alex, Windows, Linux de escritorio) | Edición completa y render | «Abrir en Blender» con `pedirLanzamiento("blender")` (ya en `BINARIOS_PERMITIDOS`, siempre con confirmación y solo desde la app nativa); render de trabajos 3D por la cola local; exporta GLB al OS |
| **Neurona sin Blender** (web, PWA, móvil, visor XR) | Ver y mover 3D en el navegador | three.js (`GLTFLoader`), calidad por `src/lib/xr/calidad.ts`; para renderizar con Blender **encola** el trabajo en otra neurona de la MISMA cuenta que tenga Blender (patrón de `apps-en-la-malla.md`); si no hay ninguna, dice «próximamente: ninguna de tus neuronas tiene Blender» |
| **A1 / nube sin GPU** | Render por lotes en cola | perfil `ligero`: Workbench y Cycles CPU, un trabajo a la vez, cediendo ante el escritor del enjambre; solo para lo ligero (miniaturas, GLB, previsualizaciones, lotes nocturnos) |
| **Mac de 8 GB** | Igual que escritorio, pero con freno de memoria | no arranca con < 1,5 GB libres ni con presión de memoria ≥ 2; consulta `~/.starseed/gobernador.json`; un solo trabajo |

## 6 · Salidas y procedencia

| Salida | Para qué | Notas |
|---|---|---|
| **GLB** | three.js, XR (`MundoSpec`), avatares, orbe 4D (`transformar`), Biblioteca de modelos | +Y arriba, modificadores aplicados, sin comprimir por defecto, ≤ 20 MB recomendado para móvil |
| **PNG / EXR** | imágenes, miniaturas, fondos, carteles | EXR para componer después (HyperFrames/Estudio) |
| **MP4** | clips para el Estudio audiovisual y HyperFrames | FFmpeg viene dentro de Blender; para vídeo con audio se compone después |
| `.blend` | proyecto editable de la persona | solo como SALIDA y en sus archivos; nunca se importa un `.blend` ajeno |

Cada salida lleva `<archivo>.provenance.json` (como el taller 3D): versión y hash de Blender, versión del vocabulario, SHA-256 del trabajo y del guion, segundos,
pico de memoria, neurona (alias, no ruta) y el SHA-256 de la salida.

## 7 · Seguridad

1. **GPL fuera del bundle.** Proceso hijo, `execFile` con lista de argumentos, ningún `import bpy`, ningún binario de Blender dentro del repo ni de Vercel. La ficha enlaza a las
   descargas oficiales; cualquier instalación asistida comprueba el SHA-256 de `blender-<versión>.sha256` de la release antes de abrir nada.
2. **Sin claves ni red.** El hijo recibe un entorno vacío: `PATH` mínimo, `HOME`, `TMPDIR` y `BLENDER_USER_RESOURCES` dentro de la carpeta del trabajo y `LANG`. Nada que contenga `KEY`, `TOKEN`
   o `SECRET`, ni `HTTPS_PROXY`. Con `--factory-startup` el acceso en línea de Blender está apagado (comprobado aquí) y el verificador impide `socket`/`urllib`. Donde el sistema lo permita
   el proceso corre sin red (`unshare -n` en Linux; en macOS, un perfil de `sandbox-exec`: **por comprobar** en BLD1025E).
3. **Autoejecución apagada:** `--factory-startup`, `--python-exit-code 3`, sin `--python-use-system-env` ni `--python-use-user-env`, y sin abrir `.blend` ajenos.
4. **Carpeta de trabajo propia** (`~/.starseed/blender-3d/trabajos/<id>/`, permisos 700) con `entradas/` (copias) y `salidas/`; se borra al terminar salvo las salidas entregadas.
5. **Topes duros:** tiempo (se mata el grupo de procesos), memoria (sondeo del RSS del grupo cada 500 ms; `RLIMIT_AS` no sirve con Blender), tamaño de salida y número de ficheros.
6. **Quién puede pedir:** `/api/3d/trabajos` solo desde esta máquina (`guardianMando`, como `/api/conversion`; 404 en un despliegue sin neurona). Desde otra neurona de la cuenta, por la malla y con
   token. Ámbito privado → solo neuronas de la misma cuenta.
7. **Registros sin rutas absolutas ni nombres de usuario**; el registro del hijo se recorta a 4 KB antes de guardarlo.
8. **Puente MCP:** §1.6. **Complementos de Blender de terceros: ninguno** salvo los que trae Blender (`--factory-startup` no carga los del usuario).

## 8 · Dónde se usa

| Superficie | Cómo usa Blender | Tarea |
|---|---|---|
| **Protomolécula** | Blender entra en el grafo de conversores como paso «servicio» (`conv-blender.ts`, igual que `conv-filee.ts`): obj/fbx/stl/ply/svg → glb y render de una escena; la ficha del catálogo (`blender`) se pone al día. Un átomo interactivo (cambiar cámara, luz o material por voz sobre un `Trabajo3D`) es la ola siguiente, no esta cola | BLD1025H |
| **Astraura** | acción `[[ACCION: render_3d {...}]]` y chat: «renderiza una esfera cristalina en 1080p» → un `Trabajo3D` validado, con el resultado adjunto en el chat; «abrir en Blender» | BLD1025I |
| **Estudio audiovisual / intros** | las escenas 3D del Estudio (p. ej. el logo facetado con la luz del ojo de la intro «Identidad En Movimiento») se renderizan como MP4/EXR y se componen en HyperFrames; plantilla de `Trabajo3D` por registro de marca | BLD1025J |
| **StarSeed XR** | GLB para mundos (`MundoSpec` cita modelos por referencia); render de previsualizaciones | consumidor de BLD1025F |
| **Avatares 3D / taller** | `taller-3d` seguirá con su `blender_de` propio hasta una ola siguiente; entonces pasará a la detección única y su `Hierro.blender` (hoy siempre `false` en el navegador, `reparto-taller.ts`) leerá `capabilities.blender` | fuera de esta cola |
| **Orbe 4D** | recibe el GLB y se transforma (`starseed:protomolecula-orbe-estado` `transformar`) | consumidor de BLD1025F |

## 9 · Biblioteca y autoactualización

- **Ficha `repo-blender`** (este commit, `src/lib/library/repos-os.ts`): `kind: "project"`, upstream `https://github.com/blender/blender` (espejo oficial), `canal: "tags"` con
  `patronTag: ^v5\.2\.\d+$`, versión `5.2.3`, GPL-3.0-or-later, `comingSoon` con el motivo («Llega con la ola 1025B…») hasta que el orquestador verifique en la Mac el render de punta a punta de BLD1025F; entonces se activa con una edición de una línea (`comingSoon: false`), igual que las demás fichas de `repos-os.ts`. La Protomolécula ya tiene su entrada `blender` en el catálogo
  (`proto-blender` en la Biblioteca): igual que Filee y HyperFrames, conviven las dos.
- **Hueco que hay que cerrar (BLD1025G):** `compararVersiones` (`src/lib/library/actualizaciones.ts`) solo sabe comparar SHA; con una etiqueta `v5.2.3` devuelve «desconocida». Hay que
  enseñarle versiones numéricas y que elija la MÁS ALTA entre las etiquetas que casan (la API de etiquetas de GitHub ordena por texto: `5.2.9` iría antes que `5.2.10`). Además el catálogo
  trae `blender` como `flathub`/`5.2` (viejo) y `/api/library/actualizaciones` no usa `actualizacion.fuente` ni `filtro` de las entradas `proto-*`.
- **Por neurona:** cada neurona publica su versión (§2). La Biblioteca compara **la de cada neurona** con la remota y dice «tu Mac tiene 5.2.0 y hay 5.2.3».
- **El OS no actualiza Blender solo.** Instalar es una descarga de 346 MB de un programa GPL ajeno, con disco justo: la ficha enseña el comando exacto, explicado (qué es, por qué y cómo):
  Mac `brew upgrade --cask blender`; A1 `sudo apt-get install --only-upgrade blender` (la distro lleva 4.0.x: sirve para lotes, no trae las novedades de 5.x).

## 10 · Piezas y archivos

| Pieza | Archivo | Tarea |
|---|---|---|
| Detector + perfil (Python) | `servicios/blender-3d/deteccion.py` + `test_deteccion.py` | BLD1025B |
| Vocabulario + tipos + validador | `src/lib/blender3d/vocabulario.json`, `src/lib/blender3d/trabajo.ts` + prueba | BLD1025C |
| Barreras (validador Python + verificador AST) + generador de guion | `servicios/blender-3d/barreras.py`, `generador.py` + prueba | BLD1025D |
| Ejecutor por lotes (cola, topes) + funciones que corren dentro de Blender | `servicios/blender-3d/ejecutor.py`, `ops_starseed.py` + prueba | BLD1025E |
| Ruta local `/api/3d/trabajos` | `src/app/api/3d/trabajos/route.ts`, `src/lib/blender3d/cola-servidor.ts` + prueba | BLD1025F |
| Versión por neurona + comparación numérica | `src/lib/library/actualizaciones.ts`, `src/lib/neurons/neurons.ts` (≤ 30 líneas) + prueba | BLD1025G |
| Blender en el grafo de conversores + catálogo | `src/lib/protomolecula/conv-blender.ts`, `catalogo-herramientas.ts` + prueba | BLD1025H |
| Acción de Astraura | `src/lib/aurora/actions.ts` (≤ 30 líneas), `src/lib/blender3d/accion-render.ts` + prueba | BLD1025I |
| Plantilla del Estudio (intro 3D) | `servicios/blender-3d/plantillas/intro-logo-facetado.json`, `.agent/skills/claude-video-studio/STARSEED.md` + prueba | BLD1025J |
| Puente MCP opcional (`aprobacion: true`) | `servicios/blender-3d/puente_mcp.py` + prueba | BLD1025K |

## 11 · Cómo se prueba cada capa

- Python: `python3 -m unittest servicios/blender-3d/test_*.py`; las pruebas contra Blender de verdad llevan `unittest.skipUnless(shutil.which("blender"))` y no corren en máquinas sin él.
- TypeScript: `npx vitest run <archivo>` y `tsc --noEmit` con cerrojo.
- Prueba de punta a punta (en BLD1025F): un `Trabajo3D` de un cubo → cola → GLB y PNG reales; el GLB empieza por `glTF` y el PNG por `\x89PNG`.
- Prueba de «no ejecuta código libre»: textos de inyección en nombres y textos; el trabajo se rechaza o el texto queda como dato; el verificador AST no deja pasar nada fuera de la lista.

## 12 · Decisiones para Alex

1. **Mac:** instalar con `brew install --cask blender` (5.2.3, 346 MB de descarga; lo hace el orquestador). Disco justo: ¿hay sitio para ~1–1,5 GB?
2. **A1:** ¿permitir Blender allí (Ubuntu 24.04 → 4.0.2 con apt, sin GPU, 2 OCPU compartidos con el escritor del enjambre)? Recomendado: sí, solo trabajos `borrador`/`normal` de ≤ 5 min y cediendo ante el enjambre.
3. **Puente MCP** (`blender-mcp`): ¿sí o no? Recomendado: **no por defecto**; si sí, solo en tu escritorio, con los tres seguros de §1.6.
4. **Actualización:** avisar y dar el comando (recomendado) o actualizar solo (no recomendado: GPL, 346 MB, disco).
5. **Serie:** fijar la 5.2 LTS hasta julio de 2028 (recomendado) o seguir cada versión nueva (cada ~4 meses).
6. **Vocabulario v1:** ¿te vale la lista de §4.1? En particular `importar` archivos de la persona y SVG (para el logo de la intro).
7. **Colas:** `starseed_memory_root/` está en `.gitignore`; esta cola va en el commit con `git add -f`. Si quieres que viaje con el repo para la nube, la ruta versionada es `enjambre/colas/`.
