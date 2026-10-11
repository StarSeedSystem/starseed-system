# Avatares 3D autopersonalizables · contrato (AV1011)

> Fecha: 2026-10-11 · Pedido por Alex · Núcleo: `src/lib/avatares/adn/` (8 módulos puros, 76 pruebas)
> Relacionado: `architecture/astraura-bots.md` (la orbe ES el bot), `src/lib/avatares/movimiento/` (motor único de movimiento),
> `src/lib/xr/calidad-perfiles.ts` (niveles de avatar en XR), Protomolécula (catálogo de herramientas).

## §0 · Qué pidió Alex

Que los bots/dots de Astraura, y los perfiles, grupos y páginas que elijan un avatar 3D, tengan un avatar
**completamente autopersonalizable en tiempo real**, usando UniMate y lo útil de: image-to-3dlab, Meta Horizon
Create, Smart Remesh, Filigree3D, BTC3D, Tripo, 3DAIStudio, Hitem3D, Meshy y Hi3D.

## §1 · Lo que hay DE VERDAD en cada enlace (verificado el 2026-10-11)

| Enlace | Qué es | Estado real | Cómo entra en StarSeed |
|---|---|---|---|
| **UniMate** (Princeton, SIGGRAPH Asia 2026) | Texto → movimiento para **cualquier esqueleto** (bípedo, cuadrúpedo, ave, pez, insecto, serpiente, objeto articulado), en tiempo real, sin reentrenar por esqueleto. **No** crea ni edita avatares: anima los que ya tienen esqueleto. | Código MIT; **inferencia anunciada pero NO publicada**. Pesos en Hugging Face (`Linzhan/UniMate`, 2026-09-27, ~26 GB con todos los puntos de control, sin licencia declarada). | Motor del nivel «vivo» del movimiento para esqueletos **libres** (criaturas, bots no humanos). Vigía en la Biblioteca: el día que publiquen la inferencia, se crea sola la tarea de instalarlo. Hasta entonces nunca se elige (§4). |
| **image-to-3dlab** | Imagen → modelo 3D con textura, **en local en Mac Apple Silicon** (32 GB recomendados), con un `.provenance.json` de licencias por resultado. Motores: Hunyuan3D-MLX, TRELLIS.2, Stable Fast 3D. | Funciona hoy. Hunyuan: pesos **sin licencia para la UE, Reino Unido y Corea del Sur**. TRELLIS.2: uso comercial condicionado (DINOv3). SF3D: licencia comunitaria de Stability (tope de ingresos). | Etapa «generar» del taller en neuronas Mac de 32 GB. Adoptamos su idea de **procedencia por resultado**: cada ADN lleva la suya (§2, §5). |
| **Smart Remesh 3** | Complemento de Blender que limpia mallas de IA (cuadrículas uniformes, paneles duros). | **Cuesta 17 USD** (no es gratis), GPL, sin uso sin ventana documentado. | Opcional si Alex lo compra. Por defecto remallamos con **Instant Meshes** (BSD-3, el mismo motor que usa su modo orgánico) y **QuadriFlow de Blender** sin ventana. |
| **Pixal3D** (Tencent ARC, SIGGRAPH 2026) | Imagen → modelo 3D con texturas PBR (GLB), llevando cada píxel a su sitio en 3D: el de más detalle de la lista. | Código y pesos **MIT** (Hugging Face `TencentARC/Pixal3D`, ~46 GB con todas las variantes). **Solo NVIDIA** (natten con CUDA), sin Mac; VRAM mínima no publicada, con modo de poca VRAM a 1024. Se apoya en TRELLIS.2 (DINOv3): uso comercial sin comprobar. Tiene un Space público con GPU gratis (ZeroGPU A10G, cuota diaria). | Generador de «calidad» del taller en neuronas NVIDIA; su Space solo como respaldo **remoto** con permiso expreso (§11). |
| **Filigree3D** (arXiv 2609.34900) | Imagen → geometría a resolución 2048³ (hasta 4096³), ~1 min. | Solo artículo, sin código ni pesos enlazados. | Vigía en la Biblioteca. |
| **BTC3D** (arXiv 2609.39709) | Mejora de detalle sin entrenar para generadores imagen→3D por difusión (teselas mezcladas). | Solo artículo, sin código enlazado. | Vigía; etapa opcional «detallar». |
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
Kimodo mueve SOMA y SMPL-X; los esqueletos libres usan clips procedurales hasta que UniMate publique su
inferencia. Preparación conocida de UniMate (de su página): articulaciones en orden de anchura, escala por el
diámetro de la topología, marco canónico y-arriba con la raíz en el origen mirando a +z, rotaciones relativas a
la pose de reposo. El adaptador se escribe **cuando** exista su código, no antes.

## §9 · Fases (cola `cola-avatares-1011.json`)

AV1011A visor VRM vivo · B editor en tiempo real (deslizadores, voz, MIDI) · C orbe→avatar en los bots ·
D avatar 3D en perfiles, grupos y páginas (sin migración: el ADN va a la Biblioteca) · E sincronía en escenas y
XR · F servicio local «taller-3d» · G vigías de UniMate, Filigree3D y BTC3D · H catálogo de la Protomolécula ·
I proveedores externos opcionales (apagados) · J propuestas y votos de avatar en grupos · L plantillas iniciales
CC0 (como mucho 10 modelos y 30 MB) · K integración y verificación.

## §10 · Lo que decide Alex

- Comprar Smart Remesh (17 USD) o quedarnos con Instant Meshes + QuadriFlow (gratis).
- Activar Meshy o Tripo (de pago; nada se activa sin su clave y su palabra).
- Si alguna neurona con GPU NVIDIA se suma (para riggear con UniRig y, cuando salga, UniMate).

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
