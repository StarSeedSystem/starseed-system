# Imágenes locales de Astraura por capas y malla · contrato (IMG1011)

> Fecha: 2026-10-11 · Pedido por Alex · Núcleo: `src/lib/imagenes/` (modelos, plan, sugerencias; 21 pruebas)
> Se apoya en `architecture/generacion-audiovisual-astraura.md` (Adenda 138, `src/ai/astraura/media/media-gen.ts`):
> su **regla de oro sigue intacta** — la imagen por texto SIEMPRE funciona gracias a la web gratis (Pollinations).
> Esto la amplía con modelos LOCALES por capas, varias opciones por petición y la malla de neuronas.
> Relacionado: `architecture/astraura-avatares-3d.md` (referencias para 3D), Protomolécula, bots de Astraura.

## §0 · Qué pidió Alex

IA generadoras de imágenes locales para las referencias de los modelos 3D y para imágenes de cualquier tipo,
autoadaptables a la capacidad de cada contexto, por capas y potenciadas por la malla de neuronas; en todo
StarSeed OS donde esté Astraura (chats, agentes, bots); que Astraura mantenga los modelos actualizados y
encuentre nuevos; resultados con varias opciones y variaciones, locales o externas, mostrados con la
Protomolécula; un paquete base instalable en las apps con sugerencias automáticas por neurona y por malla.

## §1 · Lo verificado el 2026-10-11

| Modelo | Licencia (Hugging Face / repo) | ¿Comercial? | Motores | Notas |
|---|---|---|---|---|
| **Qwen-Image 2.1** (2026-09-20) | Qwen Research License | **No** (solo investigación/evaluación; licencia aparte) | stable-diffusion.cpp, ComfyUI, Diffusers | Genera y edita, hasta 10 referencias, transparencia nativa; repo ~47 GB |
| **Qwen-Image** | Apache-2.0 | Sí | sd.cpp, ComfyUI, Diffusers | La opción Qwen comercial |
| **Krea 2** (Turbo 8 pasos / Raw) | Krea 2 Community License (código Apache-2.0) | **Solo con licencia de pago** | sd.cpp, ComfyUI | Gated; VRAM no publicada |
| **FLUX.1 [schnell]** | Apache-2.0 | Sí | sd.cpp, ComfyUI, Diffusers, Forge | Gated (aceptar términos); 4 pasos |
| **FLUX.1 [dev]** (+ GGUF de city96, Q2_K–Q8_0) | FLUX.1 [dev] Non-Commercial | **No** (el modelo) | ídem | Gated el oficial; la GGUF no |
| **SD 3.5 Medium / Large** | Stability AI Community License | Condicionado (tope de ingresos) | sd.cpp, ComfyUI, Diffusers | Gated |
| **SDXL 1.0** | CreativeML OpenRAIL++-M | Sí (uso responsable) | todos | |
| **SD 1.5** | CreativeML OpenRAIL-M | Sí (uso responsable) | todos | El repo de runwayml ya no existe: réplica `stable-diffusion-v1-5/stable-diffusion-v1-5` |
| **PixArt-Σ** | OpenRAIL++ | Sí | sd.cpp, Diffusers | |
| **Sana 1.6B** (NVIDIA) | Apache-2.0 (ficha HF) | Sí | **solo Diffusers** | No figura en sd.cpp |
| **SD-Turbo** (pestaña) | Stability (su LICENSE.md, sin etiqueta) | Condicionado, sin comprobar | ONNX Runtime Web + WebGPU, sd.cpp | Demo de Microsoft: < 1 s en RTX 4090 |

Motores: **stable-diffusion.cpp** (MIT) es la base universal — CPU, Metal, CUDA, Vulkan, OpenCL, SYCL, pesos
GGUF; ya soporta Qwen-Image 2.1 y Krea 2; su modo RPC reparte cálculo entre máquinas pero **no tiene
autenticación** (solo dentro de la malla privada, apagado por defecto). **ComfyUI** (GPL-3.0): NVIDIA/AMD/
Intel/Apple, desde 4 GB de VRAM + 8 GB de RAM, API local. **Forge** (AGPL-3.0): su estado se actualizó por
última vez en 2024 → solo compatibilidad (el OS ya habla la API de AUTOMATIC1111). La memoria de la tabla
del código es **orientativa**; el instalador mide el pico real en cada neurona y esa medida manda.

## §2 · Catálogo (`modelos.ts`)

Tabla de modelos y motores con licencia, «gated», capacidades (texto a imagen, edición, texto legible,
transparencia, varias referencias, rápido), pasos y resolución por defecto, y memoria orientativa.
`memoriaNecesaria` usa la medida real cuando existe.

## §3 · Las capas (`plan.ts`)

De lo más cercano a lo más lejano: **dispositivo** (la propia neurona) › **navegador** (la pestaña con
WebGPU) › **neurona** (otra tuya) › **malla** (una de tu grupo o comunidad que la ofreció) › **espacio**
(Space público de Hugging Face con GPU gratis y la cuota de cada persona: FLUX.1 schnell y Qwen-Image,
verificados en marcha el 2026-10-11; el de Qwen-Image 2.1 corre en CPU básica y no se usa) › **web gratis**
(Pollinations: solo texto) › **externo** (de pago, con tu clave). `cabe` decide motor y cuantización: GPU
dedicada nativa si cabe, si no 8 o 4 bits con sd.cpp; si no hay GPU, CPU o memoria unificada de Mac (lento).

## §4 · Varias opciones por petición (`planImagen`)

Cada petición devuelve hasta 8 opciones: primero **un modelo distinto por opción** (comparar es elegir
mejor), luego más semillas de los mejores. Orden: capa cercana, licencia más libre, gama (calidad) o pasos
(rapidez), sin cuantizar antes que cuantizado. Reglas duras: nada no comercial en uso comercial; con imagen
de referencia, **nada sale de tus neuronas sin permiso**; edición/transparencia solo con modelos que las
tengan; neuronas ocupadas no reciben trabajo. Cada opción lleva su procedencia y licencia.

## §5 · Paquete base sugerido (`sugerencias.ts`)

Por neurona: uno **rápido**, uno de **calidad** y uno de **texto legible o edición**, si caben. Licencia más
libre primero; en CPU no se sugiere gama alta (minutos por imagen); lo que ya ofrece otra neurona tuya se usa
desde la malla en vez de duplicarlo; avisa cuando un modelo pide aceptar términos con cuenta de Hugging Face.
Hoy, por ejemplo: Mac de 8 GB → SD-Turbo + SDXL a 4 bits; A1 sin GPU → FLUX schnell + SDXL + SD 3.5 Medium;
PC con NVIDIA de 24 GB → FLUX schnell + Qwen-Image + SD 3.5 Large.

## §6 · Dónde aparece

Chats de Astraura (herramienta `generar_imagen` y directiva de acción), agentes, bots (acción
`imagen.generar`), Protomolécula, editor de avatares y taller 3D («usar como referencia para 3D»). El resultado
es una **tarjeta de la Protomolécula** con todas las opciones: elegir, variar, editar, ampliar, usar en 3D,
guardar en la Biblioteca o pasar a borrador de publicación, con licencia y atribución visibles.

## §7 · Siempre al día

Un explorador diario consulta Hugging Face (modelos de texto a imagen en tendencia y nuevas versiones de los
instalados) y las versiones de sd.cpp y ComfyUI; propone fichas con licencia y «gated» extraídos de su fuente;
**nada se instala solo**: Astraura sugiere y la persona acepta; lo no comercial queda marcado.

## §8 · Cuidados

Sin descargas automáticas (comprobar ≥ 3× el espacio y pedir permiso); en la Mac de Alex las imágenes ceden ante
el enjambre (guardia de memoria); en la A1, hilos limitados para no ahogar sus servicios; ningún sondeo a
Supabase (las capacidades se publican al arrancar y al cambiar); el token de Hugging Face, si hace falta, va en
el entorno y nunca en el código.

## §9 · Cola `cola-imagenes-1011.json` — estado REAL (verificado el 2026-11-01, IMG1011J)

| Tarea | Estado real | Dónde se ve |
|---|---|---|
| IMG1011A · servicio local de imágenes por neurona | Escrito y con pruebas Python en verde (sin red ni GPU: 18 pruebas de `servicios/imagenes-local` y `scripts/imagenes`). **SIGUE SIN MOTOR DE IMÁGENES INSTALADO**: ninguna neurona tiene el servicio encendido ni pesos descargados, así que todavía no ha generado ninguna imagen real. Se enciende por systemd (`imagenes-local.service`) con el token en `IMAGENES_LOCAL_TOKEN` y publica sus capacidades en `capabilities.imagenes`. | `servicios/imagenes-local/` |
| IMG1011B · proveedor «neuronas» en media-gen | Escrito y con pruebas en verde: reparte la petición por capas con `planImagen` y devuelve VARIAS opciones a la vez; si ninguna neurona responde, cae a la web gratis (regla de oro) y lo que no corre se cuenta en `descartes`. | `src/ai/astraura/media/proveedor-neuronas.ts` |
| IMG1011C · tarjeta de opciones | Escrita y con pruebas en verde: `TarjetaImagenes` muestra las opciones con sus acciones (elegir genera la imagen y la guarda en la Biblioteca con su atribución, variar replanifica con semillas nuevas, ampliar, guardar, borrador de publicación y referencia 3D). «Editar en la Protomolécula» todavía cae en un sustituto (`src/lib/protomolecula/editor.ts` resuelve «hecho» sin abrir nada): queda pendiente abrir el editor real. | `src/components/imagenes/`, `src/lib/imagenes/adaptadores/use-tarjeta-imagenes.ts` |
| IMG1011D · chats, agentes y bots | La herramienta `generar_imagen` del chat pide y muestra VARIAS opciones (por defecto 4): cada opción llega al mensaje como una imagen con su procedencia en el texto alternativo (que la ventana enseña) y la primera queda en la Biblioteca. Los bots tienen la acción `imagen.generar` definida con su permiso; la pantalla del bot no muestra todavía la tarjeta de varias opciones. | `src/lib/integrations/aurora-tools.ts`, `src/lib/aurora/generate/service-generation.ts`, `src/lib/astraura-bots/acciones.ts` |
| IMG1011E · sugerencias e instalador en las apps | Escrito y con pruebas en verde: `SugerenciasInstalacion` pregunta el hierro REAL (servicio local o sondas de la web, y en la web lo dice), muestra el tamaño REAL de descarga por repositorio y explica cómo aceptar los términos de los gated. Montado ya en: Habilidades (`/habilidades`) y ajustes de la neurona (pestaña «Configuración & Preferencias» del Studio 1.58). El «Instalar en esta neurona» funciona con el servicio de IMG1011A encendido. | `src/components/imagenes/sugerencias-instalacion.tsx`, `src/lib/imagenes/adaptadores/hierro-local.ts` |
| IMG1011F · malla de neuronas | La capa está escrita y probada: el plan de la tarjeta lista las neuronas de la malla (`useMallaNeuronasEstado`) y las capacidades viajan en el latido. Sin ninguna neurona con motor, hoy no hay trabajo de imagen real repartido por la malla. | `src/lib/network/malla-neuronas.ts`, `src/lib/imagenes/plan.ts` |
| IMG1011G · explorador y autoactualización | Escrito y con pruebas Python en verde, pero **nunca se ejecutó en producción** (no hay servicio que lo lance ni `propuestas-imagenes.json`). Además, según `vigia-modelos.md`, ordena por «likes» y solo mira versiones del mismo repositorio: no detectaría p. ej. Qwen-Image-2.1-Turbo; queda por mejorar el orden y ponerlo en el ciclo del vigía. | `scripts/imagenes/explorador_modelos.py`, `architecture/vigia-modelos.md` |
| IMG1011H · SD-Turbo en la pestaña | Escrito y con pruebas en verde: generación en la pestaña del navegador con WebGPU (worker incluido), carga perezosa, y `planPesos` decide descargar o no: sin permiso del usuario o sin espacio comprobado en la cuota no descarga; con los pesos ya en caché genera sin descargar. | `src/lib/imagenes/adaptadores/webgpu-sd-turbo.ts` y `.worker.ts` |
| IMG1011I · fichas del catálogo | Escritas y con pruebas en verde: las fichas verificadas el 2026-10-11 (§1) están en `MODELOS_IMAGEN` con su licencia, «gated», capacidades, pasos y memoria orientativa (la medida real manda al instalar). | `src/lib/imagenes/modelos.ts` |
| IMG1011J · integración y verificación | Hecha hoy: tarjeta y sugerencias montadas donde la gente las encuentra (chat de Astraura con varias opciones en `generar_imagen`, ajustes de la neurona en el Studio 1.58 y Protomolécula en el resultado de la ventana), `tsc` y todas las pruebas de los cuatro módulos y los dos servicios en verde, sin `next build`. Resumen honesto: corre hoy de verdad la web gratis y lo local arranca al encender el servicio de IMG1011A. | este archivo, `src/components/imagenes/index.ts` |

**La línea honesta:** lo que corre HOY de verdad es la web gratis (Pollinations) y el plan/sugerencias/tarjeta;
lo local se enciende cuando una neurona instale su motor (servicio IMG1011A + permisos del contrato §8: nada se
descarga solo). Nada de esto llama a Supabase en sondeo y ninguna clave vive en código.
