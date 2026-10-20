# Avatares 3D autopersonalizables · contrato (AV1011)

> Fecha: 2026-10-11 · Pedido por Alex · Núcleo: `src/lib/avatares/adn/` (8 módulos puros, 79 pruebas)
> Relacionado: `architecture/astraura-bots.md` (la orbe ES el bot), `src/lib/avatares/movimiento/` (motor único de movimiento),
> `src/lib/xr/calidad-perfiles.ts` (niveles de avatar en XR), Protomolécula (catálogo de herramientas).

## §0 · Qué pidió Alex

Que los bots/dots de Astraura, y los perfiles, grupos y páginas que elijan un avatar 3D, tengan un avatar
**completamente autopersonalizable en tiempo real**, usando UniMate y lo útil de: image-to-3dlab, Meta Horizon
Create, Smart Remesh, Filigree3D, BTC3D, Tripo, 3DAIStudio, Hitem3D, Meshy y Hi3D.

## §1 · Lo que hay DE VERDAD en cada enlace (verificado el 2026-10-11; UniMate, Filigree3D y BTC3D corregidos el 2026-10-20 por su vigía, §13)

| Enlace | Qué es | Estado real | Cómo entra en StarSeed |
|---|---|---|---|
| **UniMate** (Princeton, SIGGRAPH Asia 2026) | Texto → movimiento para **cualquier esqueleto** (bípedo, cuadrúpedo, ave, pez, insecto, serpiente, objeto articulado), en tiempo real, sin reentrenar por esqueleto. **No** crea ni edita avatares: anima los que ya tienen esqueleto. | **Corregido el 2026-10-20** (README y archivos leídos en la red pública; la fila del 11 decía «inferencia anunciada pero NO publicada» y ya no es verdad). **Código de entrenamiento e inferencia publicado desde el 2026-09-06**, licencia **MIT** (`Friedrich-M/UniMate`; el comando es `python -m unimate.inference.sample --exp_dir <punto de control> [--asset <activo con esqueleto>]` y existe `unimate/inference/sample.py`). Desde el 2026-10-05 trae `rig_preprocess`, que convierte un GLB/glTF/FBX con esqueleto en un activo animable (etiqueta las articulaciones **con un LLM** y se detiene para revisarlas; qué LLM usa y si exige clave **no está comprobado**). Entorno: conda con Python 3.10 y `requirements.txt`; la VRAM de inferencia **no está publicada**. **Pesos** (`Linzhan/UniMate`, puntos de control de prueba desde el 2026-09-27, ~26 GB con todos): licencia **CC BY-NC 4.0, no comercial**; el código es MIT pero los pesos NO. Los datos (UniML3D, ~88 GB) siguen las licencias de sus fuentes (Mixamo, Objaverse-XL y Truebones, esta última bajo su propia licencia comercial). Hay derivados de terceros con licencia sin comprobar: `mlx-community/unimate-uniml3d-f60-v3-bf16` (MLX, Apple Silicon), `BasinShapers/unimate-webgpu` (WebGPU) y `tarn59/UniMate-Weights` (copia de pesos). | Motor del nivel «vivo» del movimiento para esqueletos **libres** (criaturas, bots no humanos). Con pesos no comerciales solo se elige donde ese uso lo permite (§4 y §5) y **no se activa por defecto**. En su primera pasada real el vigía (§13) crea la tarea del adaptador (`VGUNIA`), **propuesta en `olas/propuestas/`** (fuera del enjambre; solo entra si Alex la mueve a `olas/`); mientras el adaptador no esté integrado, `motores.ts` sigue diciendo `pesos-sin-codigo` y no se elige. |
| **image-to-3dlab** | Imagen → modelo 3D con textura, **en local en Mac Apple Silicon** (32 GB recomendados), con un `.provenance.json` de licencias por resultado. Motores: Hunyuan3D-MLX, TRELLIS.2, Stable Fast 3D. | Funciona hoy. Hunyuan: pesos **sin licencia para la UE, Reino Unido y Corea del Sur**. TRELLIS.2: uso comercial condicionado (DINOv3). SF3D: licencia comunitaria de Stability (tope de ingresos). | Etapa «generar» del taller en neuronas Mac de 32 GB. Adoptamos su idea de **procedencia por resultado**: cada ADN lleva la suya (§2, §5). |
| **Smart Remesh 3** | Complemento de Blender que limpia mallas de IA (cuadrículas uniformes, paneles duros). | **Cuesta 17 USD** (no es gratis), GPL, sin uso sin ventana documentado. | Opcional si Alex lo compra. Por defecto remallamos con **Instant Meshes** (BSD-3, el mismo motor que usa su modo orgánico) y **QuadriFlow de Blender** sin ventana. |
| **Pixal3D** (Tencent ARC, SIGGRAPH 2026) | Imagen → modelo 3D con texturas PBR (GLB), llevando cada píxel a su sitio en 3D: el de más detalle de la lista. | Código y pesos **MIT** (Hugging Face `TencentARC/Pixal3D`, ~46 GB con todas las variantes). **Solo NVIDIA** (natten con CUDA), sin Mac; VRAM mínima no publicada, con modo de poca VRAM a 1024. Se apoya en TRELLIS.2 (DINOv3): uso comercial sin comprobar. Tiene un Space público con GPU gratis (ZeroGPU A10G, cuota diaria). | Generador de «calidad» del taller en neuronas NVIDIA; su Space solo como respaldo **remoto** con permiso expreso (§11). |
| **PixelArtistry Watertight Meshes** | Flujos de ComfyUI: imagen → malla **cerrada** (lista para imprimir) o low-poly con texturas horneadas, con Pixal3D/TRELLIS.2 y los nodos WTiVo, Mesh Quad Reconstruct, LODTailor y CuMesh. | Instalador y flujos **MIT**; nodos GPL-3.0 o MIT. **Solo Windows 10/11 con NVIDIA RTX 20+**; publica los umbrales 6 GB → 1024, 8 GB → 1536, 16 GB → 2048; 32 GB de RAM recomendados. Proyecto muy nuevo (5 commits, sin versiones). | Remallador que cierra en neuronas Windows con NVIDIA; en el resto, cierre por vóxeles de Blender en CPU (también la A1). Sus umbrales de VRAM sustituyen a nuestros supuestos (§11). |
| **Filigree3D** (arXiv 2609.34900) | Imagen → geometría a resolución 2048³ (hasta 4096³), ~1 min. | Solo artículo, sin código ni pesos enlazados. Comprobado el 2026-10-20: Hugging Face no tiene el artículo indexado (`api/papers/2609.34900` da 404) ni modelos que lo citen, y el Atom de arXiv (versión del 2026-09-28) no enlaza ningún repositorio. | Vigía en la Biblioteca (§13): el día que aparezca un repositorio con código de inferencia, avisa y crea la tarea. |
| **BTC3D** (arXiv 2609.39709) | Mejora de detalle sin entrenar para generadores imagen→3D por difusión (teselas mezcladas). | Solo artículo, sin código enlazado. Comprobado el 2026-10-20 igual que Filigree3D (Hugging Face sin indexar, Atom de arXiv del 2026-09-30 sin repositorio). | Vigía (§13); etapa opcional «detallar». |
| **Meta Horizon Create** | Plataforma cerrada de Meta (AssetGen 2.0, mundos por texto). | Sin API pública ni pesos abiertos. El enlace de X no se pudo abrir. | Solo como referencia de experiencia (crear mundos y objetos hablando); ya lo cubren XR y Protomolécula. |
| **Meshy** | Servicio de imagen/texto → 3D, rig y animación. | De pago; plan gratis de 100 créditos/mes con salida **CC BY 4.0** (exige atribución). API no confirmada en el plan gratis. | Proveedor externo **opcional**: apagado salvo clave en el entorno y permiso de Alex; la atribución viaja en la procedencia. |
| **Tripo** | Servicio de imagen/texto → 3D. | De pago; precios y licencia de salida sin comprobar. (Sus modelos abiertos TripoSR/TripoSG ya están en la Protomolécula.) | Igual que Meshy: opcional con clave. |
| **3DAIStudio, Hitem3D, Hi3D** | Servicios de pago / agregadores. | Sin API verificada. Los enlaces traían parámetros de afiliado: **no se usan**. | Solo enlace en el catálogo. |

Además, para que funcione de punta a punta y gratis: **three-vrm** (pixiv, MIT) para mostrar y mover VRM en el
navegador, **CharacterStudio** (M3-org, MIT) como patrón de piezas intercambiables y exportación VRM/GLB, y
**UniRig** (VAST, MIT, GPU NVIDIA ≥ 8 GB) para poner esqueleto a cualquier malla.

## §2 · El ADN del avatar (`adn.ts`)

Un **mismo ADN** viste a la orbe de un bot, al avatar de una persona, de un grupo, de una comunidad o de una
página. Son datos pequeños (≤ 8 KB): base (orbe, VRM, GLB con esqueleto o procedural), esqueleto (ninguno,
VRM humanoide, SOMA 30, SMPL-X 22 o **libre** de 1 a 256 articulaciones), morfología (8 deslizadores 0…1),
materiales por ranura (piel, cabello, ojos, ropa, acento, aura), piezas por ranura (11), expresiones VRM 1.0,
aura ligada a la emoción del bot, carácter del movimiento, visibilidad (privado, grupo, público), procedencia
de licencias y revisión. La malla pesada vive en la Biblioteca: el ADN solo guarda `biblioteca:…` o
`genesis:…`, **nunca una URL externa suelta**. `sanearAdn` es la única puerta de entrada.

## §3 · Personalizar en tiempo real (`cambios.ts`, `dictado.ts`)

Todo se personaliza con **cambios** pequeños: el editor, la voz, un mando MIDI de la Protomolécula y Astraura
producen el mismo `CambioAvatar`. Tres velocidades (para no repetir las 25 000 peticiones al día):

1. **Tu pantalla**: al instante, sin red.
2. **Los demás presentes**: los cambios se agrupan por clave (mover un deslizador 60 veces viaja como uno) y se
   emiten como mucho a 10 Hz (6,7 Hz con 4–7 personas, 4 Hz con 8 o más) y **nunca** si no hay nadie mirando.
3. **Guardado**: tras 5 s de calma y como mucho uno cada 30 s, o al cerrar el editor.

§3.3 · **Dictado sin modelo**: «pelo azul, ojos verdes y aura dorada», «más alto», «cabeza más pequeña»,
«sonríe», «más tranquilo» se traducen al instante sin red. Lo que no entiende («ponle alas de mariposa») va a
Astraura, que responde con cambios del mismo formato o con una tarea del taller (§4).

## §4 · El taller de avatares (`motores.ts`, `canalizacion.ts`)

Cinco etapas: **generar** (imagen o texto → malla), **remallar**, **riggear** (esqueleto y pesos),
**detallar** (opcional) y **animar**. `planificar` elige motor por etapa según lo que tenga la neurona que
trabaja (navegador, CPU, Blender, Mac Apple Silicon 32 GB, NVIDIA 8/16 GB, clave externa) y dice por qué
descarta cada uno. Reglas: nunca un motor sin código; de pago solo si se permite **y** hay clave; nunca uno
cuya licencia excluya tu región (si no se sabe la región, lo restringido no se usa); nunca «no-comercial» para
uso comercial; preferencia: libre › atribución › condicionado › restringido. Animar siempre tiene salida
(clips procedurales del navegador). Partir de un VRM o una plantilla se salta generar, remallar y riggear.

Hoy, con el hardware que hay: la **A1** (ARM sin GPU) remalla con Instant Meshes y sirve plantillas, pero no
genera ni riggea; una **Mac de 32 GB** genera con image-to-3dlab; riggear con UniRig necesita una neurona con
NVIDIA. Ninguna etapa pesada corre en la A1 ni en un móvil.

## §5 · Licencias que viajan con el avatar

`usoPermitido(adn, { region, comercial })` dice si se puede usar así, qué lo impide y **qué atribuciones hay que
mostrar** (por ejemplo «Modelo 3D generado con Meshy»). La interfaz muestra esas atribuciones donde se vea el
avatar público.

## §6 · Calidad automática (`calidad.ts`)

Cada nivel de avatar de XR (`orbe-manos`, `cabeza-manos`, `vrm-ligero`, `vrm`, `vrm-completo`) tiene un
presupuesto (triángulos, textura, expresiones, piezas, física del pelo). `adnParaCalidad` recorta por prioridad:
primero visemas y parpadeo (que hables y parpadees), luego emociones; primero cabeza, pelo y torso. En el nivel
más bajo eres tu orbe con tu aura: la identidad no cambia, cambia cuánto se dibuja.

## §7 · Quién cambia qué (`permisos.ts`)

Probar en tu pantalla siempre se puede. Aplicar: tu avatar y tu bot personal, tú; grupo o página
**democrático**: se propone y se **vota el diff** (`diffAdn`); jerárquico: quien administra; observadores e
invitados: solo vista previa y propuesta.

## §8 · Movimiento

El carácter del movimiento del ADN alimenta al **motor único de movimiento** (vivo/fluido/ligero/quieto).
Kimodo mueve SOMA y SMPL-X; los esqueletos libres usan clips procedurales **hasta que el adaptador de UniMate
esté integrado**. Su código de inferencia (MIT) está publicado desde el 2026-09-06, pero sus pesos son CC BY-NC
4.0 (§1): el adaptador (`servicios/taller-3d/motores/unimate.py`, patrón de `pixelartistry.py`) lo escribe el
enjambre en la tarea `VGUNIA` que el vigía deja **como propuesta** en su primera pasada real (`olas/propuestas/`, fuera del enjambre: solo entra si Alex la mueve a `olas/`), sin descargar los
pesos por su cuenta (~26 GB) y sin activarse por defecto. Preparación conocida de UniMate (de su página):
articulaciones en orden de anchura, escala por el diámetro de la topología, marco canónico y-arriba con la raíz
en el origen mirando a +z, rotaciones relativas a la pose de reposo; para un esqueleto propio, `rig_preprocess`
(§1). Pendiente aparte: `motores.ts` y `canalizacion.test.ts` aún fijan el estado `pesos-sin-codigo` del 11 de
octubre; cuando el adaptador esté integrado necesitan un estado honesto («código publicado, sin adaptador» y
después «listo»).

## §9 · Fases (cola `cola-avatares-1011.json`)

AV1011A visor VRM vivo · B editor en tiempo real (deslizadores, voz, MIDI) · C orbe→avatar en los bots ·
D avatar 3D en perfiles, grupos y páginas (sin migración: el ADN va a la Biblioteca) · E sincronía en escenas y
XR · F servicio local «taller-3d» · G vigías de UniMate, Filigree3D y BTC3D (§13) · H catálogo de la Protomolécula ·
I proveedores externos opcionales (apagados) · J propuestas y votos de avatar en grupos · L plantillas iniciales
CC0 (como mucho 10 modelos y 30 MB) · K integración y verificación.

## §10 · Lo que decide Alex

- Comprar Smart Remesh (17 USD) o quedarnos con Instant Meshes + QuadriFlow (gratis).
- Activar Meshy o Tripo (de pago; nada se activa sin su clave y su palabra).
- Si alguna neurona con GPU NVIDIA se suma (para riggear con UniRig y para UniMate, cuyo código ya está publicado).
- Si UniMate entra con pesos **CC BY-NC 4.0** (uso no comercial): la tarea `VGUNIA` nace como **propuesta**
  (`starseed_memory_root/olas/propuestas/`, con su motivo en `reservada`) y el aviso trae la orden exacta para
  encolarla (`mv -n <propuesta> <olas>/`, con rutas absolutas). Encolarla es el visto bueno de Alex y después sigue el camino normal del enjambre; nadie del enjambre lee esa carpeta. Mientras siga ahí, cada aviso nuevo repite la orden; si más tarde los pesos pasan a uso libre, no se encola sola.

## §11 · Generación 3D local optimizada por destino (`optimizacion.ts`) — Pixal3D + image-to-3dlab

Pedido de Alex (2026-10-11): Pixal3D e image-to-3dlab para generar modelos 3D en local, optimizados con
inteligencia para la Protomolécula y para los bots y avatares de perfiles y páginas.

1. **Dónde corre cada uno** (`capacidadesDe`): Pixal3D y TRELLIS.2 en una neurona con NVIDIA de 16 GB o más;
   image-to-3dlab (Hunyuan3D-MLX, TRELLIS.2, Stable Fast 3D) en una Mac Apple Silicon de 32 GB o más. **La Mac
   actual de Alex (8 GB) y la A1 (sin GPU) no pueden generar**: allí el taller solo remalla, optimiza y sirve.
   El trabajo va a la neurona que pueda (MetaGenesis reparte; nada de sondeos).
2. **Destino** (`planOptimizacion`): Protomolécula = máxima fidelidad, original intacto para editar + vista
   ligera; avatar = remallado orgánico apto para esqueleto y un LOD por nivel de avatar de XR (120k, 60k, 25k,
   10k triángulos); bot = 20k → 2k; pieza = 8k → 1k. Todo lo que se ve en vivo va en meshopt y con atlas.
3. **Motor** (`planificar` con `prioridad`): calidad → el de más fidelidad (Pixal3D › TRELLIS.2 › Hunyuan ›
   SF3D); rapidez → el más rápido. Siempre: licencia más libre primero, **lo local antes que lo remoto**, lo
   gratis antes que lo de pago.
4. **Memoria** (`resolucionPara`, `siguienteIntento`): 1536 solo con 24 GB de VRAM; por debajo de 16 GB, modo
   de poca memoria; si falla, se reintenta más ligero sin preguntar, y al final se dice que no cabe.
5. **Remoto con permiso** (`espacio-hf`): el Space de Pixal3D es gratis pero la imagen SALE de tu aparato:
   solo con permiso expreso y nunca con fotos de personas sin su consentimiento.

Cola: `cola-generacion-3d-1011.json` (G3D1011A–F).

### §11.1 · Mallas cerradas (watertight) — PixelArtistry (2026-10-11)

Destino nuevo **impresión** (malla cerrada, sin texturas, original guardado) y `cerrada` en cada plan: bots y piezas
salen cerrados para que choquen bien con la física de XR. Con `cerrada`, `planificar` solo acepta remalladores
que cierran: **PixelArtistry** (ComfyUI, Windows + NVIDIA) o **vóxeles de Blender** (CPU: vale en la A1; pierde
las UV y la textura se vuelve a hornear). Instant Meshes y QuadriFlow se descartan diciendo por qué. Los umbrales
de VRAM de `resolucionPara` ahora son los publicados por PixelArtistry. Cola: `cola-mallas-cerradas-1011.json`.

### §11.2 · Decisión de Alex (2026-10-11): versiones públicas mientras no haya computadora Windows/NVIDIA

- **Generar**: el Space oficial de **Pixal3D** (TencentARC/Pixal3D) y, de respaldo, el de **TRELLIS.2**
  (microsoft/TRELLIS.2); los dos corrían el 2026-10-11 en ZeroGPU A10G.
- **Se llaman desde el navegador de cada persona**, no desde nuestro servidor: cada quien gasta SU cuota de
  Hugging Face (ZeroGPU: 2 min/día sin cuenta, 5 con cuenta gratis, 40 con PRO) y nadie agota la de otro.
- **Permiso**: la cuenta de Alex lo tiene (lo dijo él); a las demás se les pregunta una vez, y las fotos de
  personas piden siempre su consentimiento.
- **Cerrar y optimizar**: vóxeles de Blender y el optimizador en la A1 (CPU), como en §11.1.
- **Esqueleto**: los Spaces públicos de UniRig estaban en error; sin NVIDIA no hay rig automático gratis. Las
  plantillas VRM ya lo traen; a lo generado se le pone cuando haya una neurona con NVIDIA.
- Cola: `cola-espacios-publicos-1011.json`.

## §12 · Almacén del ADN (AV1011D · `adaptadores/almacen-adn.ts`, `selector-avatar-3d.tsx`)

Qué hay de verdad (2026-10-20, rescate RTAV1011Dd-d1) y qué no:

- **Dónde vive**: `localStorage` de ESTE aparato, clave `starseed.avatar.adn.v1`, un mapa `{ "biblioteca:<id>": entrada }`.
  La clave es SIEMPRE el id del ADN (`refDeAdn`), nunca la malla base: dos dueños que eligen la misma plantilla
  conservan cada uno el suyo. Una entrada antigua guardada por su malla se recoloca al volver a guardarla.
- **Revisión (§2)**: gana la más alta. Guardar una revisión más vieja que la guardada lanza un error que se puede enseñar;
  no hay copia en memoria, cada lectura va al almacén, así que una revisión nueva se ve al releer. Un id que ya es de
  otro dueño no se pisa.
- **Visibilidad**: se sella DENTRO del ADN y en la entrada (siempre coinciden); un ADN «publico» enseña las atribuciones de
  licencia de lo que lleva (§5). **«grupo» y «publico» hoy solo ETIQUETAN: no se publica ni se comparte nada.** Los ADN
  nuevos nacen «privado»; al cambiar de avatar el selector conserva la visibilidad que el ADN ya tenía (puede ser «publico»,
  p. ej. uno importado) y la interfaz todavía no deja elegirla.
- **Tope**: 24 avatares guardados (`MAX_ADN_GUARDADOS`), con un error honesto al llegar (no se expulsa nada en
  silencio). Razón: el almacén entero se espeja a la cuenta en `user_settings.prefs`, y esa columna llegó a 2,8 MB una vez.
  Si el aparato no deja escribir (lleno o bloqueado) se lanza un error: nunca se dice «guardado» si no lo está.
- **Cuenta**: el espejo es de ida (guardar y quitar). La clave **no baja** a otros aparatos (no está en `SYNCED_KEYS`,
  ver `persistencia-entre-medios.md` §6.4); hacerlo pide una fusión por entrada (mayor `rev`, empate por `savedAt`), no
  «última escritura gana» de la clave entera.
- **Pendiente, por aparato y no por cuenta**: el almacén es de TODO el aparato y el espejo sube el mapa entero. Si dos cuentas
  comparten aparato, el ADN «privado» de una acaba en `user_settings.prefs` de la otra. Antes de la fase de sincronía hay que
  filtrar el espejo a los dueños de la cuenta activa (su perfil, sus bots y sus entidades) o separar la clave por usuario.
- **Ids**: los ADN nuevos llevan `adn-<UUID>` (`nuevoIdAdn`, con respaldo sin `crypto.randomUUID`), únicos entre aparatos y
  personas para cuando lleguen a la Biblioteca real o al catálogo público.
- **Revisión y recolocación**: una entrada antigua (guardada por su malla) pasa por las mismas comprobaciones de revisión y
  dueño que la entrada actual antes de recolocarse; no se pisa nada a ciegas.
- **Recordar por dueño**: `adnActualDeDueno({ tipo, id })` devuelve el ADN guardado más reciente de un perfil, bot, grupo,
  comunidad o página. El selector parte siempre de lo guardado (no de lo pintado) y, al cambiar de avatar, reutiliza el id,
  sube la revisión y conserva la visibilidad.
- **Selector** (`SelectorAvatar3d`): props de perfil (`profileId`) o de entidad (`entityId` + `entityKind` + `rol` + `gobierno`).
  En perfil, `esPropio` es obligatorio: quien lo monte dice si quien mira es la dueña (en la ficha de otra persona solo se
  ve). Sin `rol` en una entidad solo se ve, con el motivo de `decidirCambioAvatar` (§7) y sin prometer la propuesta/voto
  (AV1011J, que no existe). Ofrece la orbe y las 6 plantillas CC0 (§9-L). Se suscribe a los cambios del almacén (`suscribirCambiosAdn`: esta pestaña y las demás del aparato): si otra instancia
  cambia el avatar del dueño, se ve sin volver a montarlo. **Todavía no está montado en ninguna ruta.**
- **Dos linajes de «ADN»**: `AdnAvatar` (este contrato) y el `adnDeSer` de los seres de Genesis son conceptos distintos;
  `Cuerpo.forma` `"ser-genesis"` y `"avatar-3d"` son caminos distintos y no se fusionan.

Falta (cada punto es una tarea propia): ADN en la ficha pública de perfil, grupo y página (hoy los perfiles pintan el
`profiles.avatar_3d` legado de la Adenda 219: un GLB por URL), bajada del almacén a otros aparatos, tipo de ítem «avatar»
en la Biblioteca real (`entity-library`), propuesta y votación en grupos (AV1011J), ADN en los bots (AV1011C) y en la
escena compartida XR (AV1011E).

## §13 · Vigías de la Biblioteca (AV1011G · `scripts/protomolecula/vigias_3d*.py`)

Quién avisa cuando UniMate, Filigree3D o BTC3D cambian, sin que nadie tenga que acordarse de mirar.

- **Qué mira** (todo público, sin claves y sin la API REST de GitHub, que da 403): README, LICENSE y sondas de
  archivo en `raw.githubusercontent.com`; modelo, artículo y modelos que citan el artículo en
  `huggingface.co/api`; y el Atom de arXiv (un solo lote). Cada respuesta es `ok`, `no-existe` (un 404 es una
  respuesta) o `sin-datos` (red caída, 403, 429, 5xx): **lo que no se pudo leer no se compara ni se inventa**.
- **Con qué lo compara**: con lo que el contrato da por sabido (`vigias_3d_datos.LINEA_BASE`, §1 del 11 de
  octubre), no con el estado de hoy. Por eso la primera pasada real da dos novedades verdaderas de UniMate
  (código publicado y pesos CC BY-NC 4.0).
- **Qué hace con una novedad**: un aviso al Chat Director (`director_chat.publicar`, de `vigia-3d`), **una sola
  vez** por novedad (estado en `~/.starseed/vigia-3d.json`; si el chat falla no se marca y se reintenta). Si el
  código pasa a estar publicado deja una tarea en `starseed_memory_root/olas/cola-<mmdd>-vigia-3d-<id>.json`
  (id fijo `VG<UNI|FIL|BTC>A`, 3 archivos: adaptador, prueba y README del taller 3D), idempotente, y con
  `aprobacion: true` y `reservada: "<motivo>"` salvo que los pesos sean de uso libre o con atribución. **Una tarea
  reservada no entra en ninguna cola viva** (2026-10-20): `aprobacion` sola solo retiene la rama en la puerta del
  orquestador, la resolución automática o el aprobador pueden soltarla y la nube no la mira. Por eso se deja como
  PROPUESTA en `olas/propuestas/cola-<nombre>.json` (el orquestador, la nube y el aprobador solo leen
  `olas/cola-*.json`) y el aviso dice cómo encolarla. Con pesos libres o con atribución va directa a `olas/`.
- **Cómo decide que el código está publicado** (`vigias_3d_fuentes.senales_readme`): una sonda (el archivo de
  inferencia existe) manda sobre cualquier «coming soon» olvidado; sin sonda vale un **comando de inferencia**
  (`python …infer|sample|demo|predict|generate…`, con o sin variables delante; no cuentan `pytest`, `train`,
  `data`, `eval`, `setup`, `run_training.py`…) o una casilla **marcada** que nombra la inferencia. Solo cuenta
  como «pendiente» lo que habla de inferencia, una demo o el código en general: «Training code will be
  released», «- [ ] Release training code», un «TODO» suelto o los pesos pendientes no la anulan. Si el
  README trae la prueba **y** dice que la inferencia está pendiente, no se afirma ni se niega: el aviso dice
  «señales contradictorias», cita el comando y la línea pendiente, no crea la tarea y se repite solo si
  cambia (cuando se aclare, la novedad «código publicado» crea la tarea).
- **Cuándo corre**: una pasada cada ~20 h (`--forzar` la salta). `--en-seco` mira la red pero no escribe nada.
  Uso: `python3 scripts/protomolecula/vigias_3d.py [--en-seco] [--forzar] [--solo unimate] [--json]`.
- **Pendiente** (no es de esta tarea): colgarlo del vigilante diario del enjambre
  (`scripts/puente/vigilante-enjambre.py`); la primera pasada real en la Mac crea el aviso y la tarea de UniMate.
- **Pruebas**: respuestas reales grabadas el 2026-10-20 en `scripts/protomolecula/grabaciones_vigias_3d/`;
  las variantes inventadas están marcadas «SINTÉTICO» en `falso_vigias_3d.py`.
