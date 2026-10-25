# Vigía de modelos y versiones: MetaGenesis busca, prueba e instala solo lo mejor para cada neurona

> **Petición de Alex (2026-10-16):** «han habido mejores modelos de generación de imágenes […] Qwen-Image-2.1 y
> Qwen-Image-2.1-Turbo. El sistema de MetaGenesis debería de por sí mismo ya haber detectado esos nuevos modelos e
> integrado en el sistema natal de generación de imágenes de StarSeed OS de Astraura IA en todos los medios,
> actualizados automáticamente a las nuevas versiones; verifica que eso haya pasado […] y si no corrígelo para que
> ocurra naturalmente automáticamente con agentes especializados en buscar nuevas versiones y actualizaciones y
> mejores modelos de código abierto para autoinstalar lo que pueda ser útil […] lo más locales y potentes y eficientes
> posibles». Y después: «eso debe considerar todo el funcionamiento y áreas de todo el sistema y la red de StarSeed, de
> sus capas de conciencia y de actualizaciones e instalaciones automáticas inteligentes con base a las capacidades de
> cada neurona».

Amplía `astraura-imagenes.md` (capas aparato › pestaña › otra neurona › malla › web; nada no comercial en uso
comercial), `capas-autoadaptables.md` (ninguna capa sin su SHA; presupuestos por medio), `voz-fusionada-astraura.md`
y la política de actualización por neurona (`src/lib/neurons/actualizaciones.ts`: manual por defecto).

## 1. Qué se comprobó el 2026-10-16 (no pasó solo)

| Novedad | Fecha | ¿En StarSeed? |
|---|---|---|
| Qwen-Image-2.1 (`Qwen/Qwen-Image-2.1`) | 2026-09-14/20 | Sí, desde el 11-10, porque **Alex lo nombró**; no lo detectó nadie |
| **Qwen-Image-2.1-Turbo** (8 pasos, misma arquitectura 7B) | 2026-10-09 | **No** |
| `unsloth/Qwen-Image-2.1-Turbo-GGUF` (Q2_K 2,47 GB · Q3_K_S 2,72 · Q4_K_M 4,2 · F16 14,2) | 2026-10-10 | **No** |
| `Tongyi-MAI/Z-Image-Turbo` (**Apache-2.0**, uso comercial libre) | 2025-11-25 | **No** |
| Archivos de ComfyUI para el Turbo (bf16, int8, LoRA Turbo; Comfy-Org) | 2026-10-09 | **No** |

**Licencia del Turbo:** igual que Qwen-Image-2.1, «Qwen Research License»: solo investigación o evaluación, sin uso
comercial salvo licencia aparte (`model-business@notice.qwencloud.com`). Entra como opción **personal** (§4), nunca
en usos comerciales ni por defecto del sistema. Z-Image-Turbo es la opción rápida **libre**.

**Por qué no pasó:**
1. El explorador `scripts/imagenes/explorador_modelos.py` (IMG1011G, 13-10) **nunca se ejecutó**: ningún servicio lo
   lanza (no hay `propuestas-imagenes.json`).
2. Aunque corriera, pide a Hugging Face los 10 de **más «me gusta» de siempre** (`sort=likes`): salen FLUX.1, SDXL,
   SD 1.4… El Turbo no. Medido hoy: con `sort=trendingScore` el Turbo es el **primero**, y con
   `author=Qwen&sort=createdAt` también.
3. Solo mira imágenes, solo «versiones» del MISMO repositorio (el Turbo es un repositorio nuevo de la misma
   familia), descarta todo lo no comercial (en vez de ofrecerlo como personal) y solo propone: no instala.
4. `scripts/puente/capas_renovar.py` (detecta versiones nuevas de las capas con SHA) tampoco está programado.
5. Ninguna neurona tiene instalado un motor de imágenes local: la generación sigue en la web gratuita.

## 2. El vigía: agentes por área, datos medidos, una pasada al día

Un director de MetaGenesis (`scripts/puente/vigia_modelos.py`) con **un especialista por área**, definido como dato
en `config/vigia-areas.json` (añadir un área = añadir una entrada):

| Área | Hugging Face (`pipeline_tag`) | Catálogo que actualiza |
|---|---|---|
| imagen | text-to-image, image-to-image | `src/lib/imagenes/modelos.ts` |
| vídeo | text-to-video, image-to-video | (catálogo por crear; de momento propuestas) |
| 3d | image-to-3d, text-to-3d | avatares/taller 3D |
| voz | text-to-speech | `src/lib/library/packages.ts` (voces) |
| oído | automatic-speech-recognition | `stt-oss/motores-oido.ts` (VZF1015A) |
| palabra y razón | text-generation (≤ 9 B, GGUF, 1-bit/1.58) | `config/capas-astraura.json` |
| reflejo | modelos de llamadas a herramientas pequeños | `config/capas-astraura.json` |
| visión | image-text-to-text (pequeños) | `config/capas-astraura.json` |
| incrustaciones | sentence-similarity, feature-extraction | conocimiento propio |
| audio y música | text-to-audio | estudio de voces |
| motores | releases de GitHub: llama.cpp, stable-diffusion.cpp, whisper.cpp, ComfyUI, fermionresearch/phonon, onnxruntime, opencode | `packages.ts` + instaladores |
| habilidades | sin Hugging Face; releases de GitHub: mattpocock/skills, heygen-com/hyperframes | `habilidades/ingenieria-a.ts` |

Fuentes por área, todas con la API pública (sin clave; `HF_TOKEN` si existe sube el límite):
- **Tendencia**: `models?pipeline_tag=<tag>&sort=trendingScore&limit=30` (NUNCA solo `sort=likes`).
- **Familias vigiladas**: `models?author=<autor>&sort=createdAt&limit=20` para Qwen, Tongyi-MAI,
  black-forest-labs, stabilityai, krea, nvidia, microsoft, FermionResearch, Cactus-Compute, prism-ml, apple,
  google, meta-llama, mistralai, deepseek-ai, ResembleAI, myshell-ai…
- **Hermanos de lo que ya tenemos**: mismo tronco de nombre (`Qwen-Image-2.1` → `-Turbo`, `-Lightning`, `-Edit`,
  `-2.2`).
- **Cuantizados**: compañeros GGUF/ONNX/MLX/Core ML de cada candidato (unsloth, city96, QuantStack, bartowski,
  lmstudio-community, mlx-community, el propio autor).
- **Versiones de las capas**: `capas_renovar.detectar_nuevas` (ya existe) y `/api/library/actualizaciones`.

## 3. Evaluación (pura y con pruebas)

- **Clase de licencia**: `libre` (Apache-2.0, MIT, BSD, OpenRAIL con uso comercial) · `personal` (no comercial,
  investigación: Qwen Research, CC-BY-NC, licencias comunitarias de pago) · `condicionada` (umbrales de ingresos,
  aceptar términos) · `desconocida` (no entra). Tabla de licencias conocidas en el propio dato, porque Hugging Face
  marca muchas como «other».
- **Seguridad**: fuera por defecto los re-subidos «uncensored», «abliterated», NSFW o sin autor reconocible; un
  repositorio de un tercero solo entra si cuantiza un modelo que ya pasó el filtro.
- **Tamaño por medio**: navegador y PWA ≤ 1 GB; Mac de 8 GB ≤ 4,5 GB de pesos activos; A1 (12 GB, CPU) ≤ 8 GB;
  PC con GPU según su VRAM; app nativa ≤ 15 % del disco. Se elige la cuantización que cabe.
- **Motor**: GGUF → stable-diffusion.cpp / llama.cpp; ONNX → web y CPU; MLX / Core ML → Apple; diffusers → GPU.
- **Mejora**: solo sube si supera al mejor actual de su área y gama en algo medible (pasos, tamaño, capacidad nueva,
  puntuación publicada) — y después **se mide en la neurona** (§5).
- **Duplicados**: se compara con todos los catálogos (ids, `hf`, `githubRepo`, familias de capas).

## 4. Capas de conciencia y contexto de uso

Las preferencias de modelos se heredan como el resto de Astraura: **sistema › comunidad › grupo › persona › neurona**.
- **Sistema**: solo modelos `libre`, los que todas las neuronas pueden recibir por defecto.
- **Comunidad y grupo**: eligen los modelos de sus bots y de su servidor de malla; solo `libre` o `condicionada` si
  el grupo cumple la condición.
- **Persona**: puede activar modelos `personal` para su uso propio (con su etiqueta visible); nunca viajan a un
  grupo, a una publicación comercial ni a la tienda.
- **Neurona**: decide lo físico (cabe, se mide, rinde).
Las restricciones (licencia, privacidad, hardware) siempre ganan a las preferencias.

## 5. Instalación inteligente por neurona

- **Plan** (`src/lib/modelos/plan-instalacion.ts`): con las capacidades medidas de la neurona, sus preferencias por
  capa y el catálogo, calcula qué instalar, actualizar o quitar por área, dentro del presupuesto de disco.
- **Modo** por neurona y por área (`actualizaciones.ts`): `manual` (por defecto: avisa con un botón), `automatica`
  (instala sola) o `inteligente` (instala sola solo si cabe, la neurona está en reposo —sin conversación, sin turno
  pesado del enjambre, cargando si es portátil— y la prueba sale mejor).
- **Instalador** (`scripts/puente/instalar_modelo.py`): descarga con verificación SHA256, conserva la versión anterior,
  cambia de forma atómica y **prueba** antes de quedarse: genera una muestra (imagen pequeña, un audio, unos tokens),
  mide tiempo y memoria, y vuelve atrás si es peor o falla. Lo anota en la ficha de la neurona para la malla.
- **Malla**: una neurona sin sitio no instala; usa el modelo de otra neurona de confianza (capa «otra neurona» /
  «malla» del contrato de imágenes). El vigía deja escrito quién tiene qué.

## 6. Cuándo corre y qué deja

- Una pasada al día. La decide el líder de MetaGenesis (acción `vigia_modelos` cuando la última pasada tiene > 20 h),
  y la ejecuta el A1 (24/7) o la Mac; nunca dos a la vez.
- Deja `starseed_memory_root/vigia/novedades-<fecha>.json` (por área: candidatos, clase, tamaños, a qué neuronas
  sirve, motivo), un resumen en el Chat Director, el panel **«Novedades de modelos»** en Genesis y, para los mejores
  (≤ 5 al día), una cola `cola-vigia-<fecha>.json` con la tarea de añadir su ficha verificada al catálogo.
- Las capas con SHA solo entran con el SHA real de Hugging Face (`lfs.oid`); si no se obtiene, no entra.

## 7. Tareas (Ola 1016M, `cola-vigia-modelos-1016.json`)

| Bloque | Tareas |
|---|---|
| Vigía | A áreas como dato · B descubrir · C evaluar (licencia, seguridad, tamaño, motor, mejora) · D director diario con colas y resumen · E programación (Mac + A1) · F acción del líder de MetaGenesis · G panel «Novedades de modelos» · O enchufes: capas_renovar, api-hunter y actualizaciones de la Biblioteca |
| Instalación | H plan por neurona · I preferencias por capas de conciencia · J instalador con SHA y vuelta atrás · K prueba y decisión · L modos manual / automática / inteligente por área |
| Lo de hoy | M fichas de Qwen-Image-2.1-Turbo (y sus GGUF), Z-Image-Turbo · N paquete base de imágenes con los nuevos |

Cada tarea toca como mucho 3 archivos y 120 líneas por archivo. Las escribe el enjambre; Claude dirige y verifica en
localhost (Genesis › Novedades de modelos) y en el A1.
