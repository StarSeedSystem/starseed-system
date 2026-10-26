# Imágenes locales de Astraura por capas y malla · contrato (IMG1011)

> Fecha: 2026-10-11 · Pedido por Alex · Núcleo: `src/lib/imagenes/` (modelos, plan, sugerencias; 30 pruebas)
> Verificado por IMG1011J el 2026-10-26 (§9 con el estado REAL de la cola).
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

## §9 · Cola `cola-imagenes-1011.json` · estado REAL (verificado por IMG1011J el 2026-10-26)

Tareas: A servicio local de imágenes por neurona · B proveedor «neuronas» en media-gen · C tarjeta de
opciones de la Protomolécula · D chats, agentes y bots · E sugerencias e instalador en las apps · F malla ·
G explorador y autoactualización · H SD-Turbo en la pestaña · I fichas del catálogo · J integración y
verificación.

Verificación de puertas hecha en esta rama (**sin red ni GPU en todas las pruebas**): `tsc` limpio
(con el turno de la máquina). `vitest`: `src/lib/imagenes` 133 (núcleo 30 · ComfyUI 20 · espacios 11 ·
hierro local 15 · malla 21 · SD-Turbo web 16 · SD-Turbo núcleo 15 · worker 5), `src/ai/astraura/media`
30 (proveedor «neuronas» 18 · ComfyUI 12), `src/components/imagenes` 5 (la tarjeta C de esta compra),
`src/lib/astraura-bots` 493 y `src/lib/protomolecula` 1 086 — **1 747 pruebas en verde**. Python de
`servicios/imagenes-local` (7) y `scripts/imagenes` (11) = **18 en verde** (el contenedor no trae
`pytest`: se corrieron con `unittest`, mismas pruebas). No se ejecutó `next build` (prohibido en la
Mac). En `main` están integradas A, B, D, E, F, G, H e I (SHAs comprobados en el §9 de abajo); lo que
falta y va en esta rama: la **tarjeta C** (sus commits nunca pasaron a `main`) y los montajes
visibles — el §6 hecho de verdad: panel de media del chat, ajustes de la neurona (s158) y página de
la Protomolécula.

| Tarea | Estado real |
|---|---|
| **A** servicio local de imágenes por neurona | Integrada en `main` (6a8c4d390): `servicios/imagenes-local`. 7 pruebas en verde en esta compra. |
| **B** proveedor «neuronas» en media-gen | Integrada en `main` (e92536024): `src/ai/astraura/media/proveedor-neuronas.ts` con `planImagen` y caída a la web gratis; media-gen devuelve `galeria`. 30 pruebas de la carpeta en verde. |
| **C** tarjeta de opciones de la Protomolécula | En esta compra: `src/components/imagenes/tarjeta-imagenes.tsx` + 5 pruebas en verde. Sus commits C/Cb/Cc nunca pasaron a `main`; el salvavidas anterior de IMG1011J la perdió. |
| **D** chats, agentes y bots | Integrada en `main` (92ee5a48d): herramienta `generar_imagen` y acción de bot `imagen.generar`. El montaje VISIBLE en el chat (panel de media, `media-gen-panel.tsx`) va en esta compra. |
| **E** sugerencias e instalador en las apps | Integrada en `main` (eca3437b6): `sugerencias-instalacion.tsx`, montada en habilidades. Los montajes en ajustes de la neurona (s158) y página de la Protomolécula van en esta compra. |
| **F** malla | Integrada en `main`: adaptador `malla-imagenes.ts`; casos y dos fallos reales corregidos por rescate (RTIMG1011Fd, 3b6f9bf68). 21 pruebas en verde en esta compra. |
| **G** explorador y autoactualización | Integrada en `main` (669f477f9): `scripts/imagenes/explorador_modelos.py` (11 pruebas, red simulada) y propuestas al director. |
| **H** SD-Turbo en la pestaña | Integrada en `main` (última pieza H-d3, 731808184): `webgpu-sd-turbo.ts`, `.worker.ts`; 36 pruebas en verde, nada se descarga sin permiso y la regla del triple probada. |
| **I** fichas del catálogo | Integrada en `main` (b8e503159): fichas con licencia y «gated» en la Protomolécula. |
| **J** integración y verificación | Esta compra: tarjeta C nueva + montajes donde la gente las encuentra (chat: panel de media; ajustes de la neurona s158; página de la Protomolécula) + puertas en verde (arriba) + este §9. Falta el empuje del orquestador a `main`. |
