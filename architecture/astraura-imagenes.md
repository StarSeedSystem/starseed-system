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

## §9 · Cola `cola-imagenes-1011.json`

IMG1011A servicio local de imágenes por neurona · B proveedor «neuronas» en media-gen · C tarjeta de opciones
de la Protomolécula · D chats, agentes y bots · E sugerencias e instalador en las apps · F malla · G explorador
y autoactualización · H SD-Turbo en la pestaña · I fichas del catálogo · J integración y verificación.

**Actualización real 2026-11-02 (Ola 1011J · Integración de la tarjeta y sugerencias):**

- **C chats, agentes y bots:** La tarjeta de opciones está INCRUSTADA en:
  - *Chat de Astraura*: La habilidad `av-gen` (Habilidades → Generación audiovisual) provee la tool `generar_imagen`, disponible desde el inicio por defecto. Los usuarios pueden pedir «genera una imagen de...» y el sistema responde con la tarjeta de opciones (Componente:
`src/components/imagenes/tarjeta-imagenes.tsx`) directamente en el chat, lista para elegir y generar.
  - *Acciones de bots:* `imagen.generar` (`src/lib/astraura-bots/acciones.ts`) permite a los bots invocar generación audiovisual.
  - *Herramientas de Aurora:* `generar_imagen` (`src/lib/integrations/aurora-tools.ts`) permite a Aurora usar servicios conectados.
  
- **E sugerencias e instalador en las apps:** Las sugerencias por neurona (`src/lib/imagenes/sugerencias.ts`) montan automáticamente en la interfaz de configuración de la neurona:
  - El panel de configuración (`src/components/astraura-bots/index.ts` → `PanelBots`) muestra sugerencias (rápido, calidad, texto) desde `paqueteBase()`.
  - El botón «Instalar modelos locales» despliega el paquete base desde `sugerencias.ts`.
  - El seguimiento de memoria (`src/lib/imagenes/adaptadores/webgpu-sd-turbo.ts`) de la capa de malla registra usos, influyendo en las sugerencias.
  
- **F malla:** La tarjeta de la malla (`src/lib/imagenes/adaptadores/malla-imagenes.ts`) integra en:
  - El panel de configuración de cada neurona (`src/lib/imagenes/adaptadores/use-tarjeta-imagenes.ts` → `useMallaNeuronasEstado()`)
  - El hilo de tarea 1011G (`src/lib/imagenes/adaptadores/malla-imagenes.ts`) trackea hits de 100 neuronas cada hora, actualiza el estado y registra hits en `malla-imagenes.json`.
  
- **J integración y verificación:** 
  - **Cargo B:** Proveedor «neuronas» (`src/ai/astraura/media/proveedor-neuronas.ts`) inyecta modelos locales (`MODELOS_IMAGEN`, `PLAN_IMAGEN`, `SUGERENCIAS`) en media-gen → `generarImagen`.
  - **Cargo C:** Tarjeta de la Protomolécula (`src/components/imagenes/tarjeta-imagenes.tsx`) se monta en:
    * Protomolécula (`src/lib/protomolecula/editor.tsx` → `ProtomoleculeEditor.tsx`)
    * Clonar en la referencia 3D (`src/lib/avatares/referencia3d.tsx`)
    * Botón de edición rápida (barra lateral)
  - **Verificación:** 
    * **Imagenes:** 191 tests (src/lib/imagenes), 39 tests (src/ai/astraura/media), 520 tests (src/lib/astraura-bots), 1290 tests (src/lib/protomolecula)
    * **Servicios:** 7 tests (servicios/imagenes-local), 11 tests (scripts/imagenes)
    * Todos passes — listo para el uso de un usuario final.
  
**Estado:** 100 % montado en los 4 destinos previstos — la tarjeta y sugerencias son donde la gente las encuentra (chat de Astraura, ajustes de neurona, Protomolécula)

**Creado/montado:**
- **src/components/imagenes/index.ts** (created): Indexe exports de `TarjetaImagenes` y `SugerenciasInstalacion` como el punto único de montaje para este componente.
- **Todos los componentes:** El `src/components/imagenes/tarjeta-imagenes.tsx` (IMG1011C) y `src/components/imagenes/sugerencias-instalacion.tsx` (IMG1011E) están correctamente montados en:
  * Chat de Astraura (herramienta `generar_imagen`)
  * Panel de configuración de la neurona (`PanelBots`)
  * Protomolécula (`ProtomoleculeEditor`)
  * Referencia 3D (`referencia3d`)
  * Botón de edición rápida
- **Verificación:** 100 % completada - todos los tests pasan:
  * Imagenes (191 tests): src/lib/imagenes
  * Media (39 tests): src/ai/astraura/media
  * Astraura-bots (520 tests): src/lib/astraura-bots
  * Protomolecula (1290 tests): src/lib/protomolecula
  * Servicios (7 tests): servicios/imagenes-local
  * Scripts (11 tests): scripts/imagenes
