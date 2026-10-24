# Laya en todas las capas de Astraura y habilidades de ingeniería para su IA

> **Petición de Alex (2026-10-18):** «también agrega estas skills tanto para nosotros como para el funcionamiento de
> toda la IA de Astraura en todo StarSeed OS con todos los contextos automáticamente para mejorar sus capacidades e
> inteligencia del modelo local nativo de Astraura en cada una de sus capas: https://github.com/mattpocock/skills
> (también debe usar Laya en todas sus capas y modelos para las mejores decisiones, incluyendo las decisiones más
> básicas de los sistemas 1.58 bits BitNet/Needle y demás fusiones de Astraura en todos sus medios):
> https://github.com/NandhaKishorM/laya».

Amplía `capas-autoadaptables.md` (capas reflejo, memoria, palabra, razón, profunda, voz, adaptador; planificador por
tarea; «el reflejo decide primero»), `astraura-capabilities.md` (skills → capacidades vivas), `apps-en-la-malla.md`
(relé `capacidad.*`) y `vigia-modelos.md`.

## 1. Qué es Laya (comprobado el 2026-10-18)

- **Qué hace:** «Sistema 1» de decisiones tipadas. Sobre cualquier estado (texto, mensaje, JSON) responde preguntas
  de tres tipos en UNA pasada, sin generar texto: `choice` (elegir una opción), `score` (nivel de una escala) y
  `noul` (probabilidad de «sí»). Sus probabilidades están calibradas (entrenado con reglas de puntuación propias), y
  `answer_confidence` es la que sirve para decidir con umbral.
- **Licencia: Apache-2.0** en el código (Python 0.4.11 del 17-10-2026, SDK TypeScript `laya-ts`, Rust, Go, Java,
  .NET) y en los tres checkpoints de Hugging Face: `laya` (ModernBERT-large, 421 M, inglés, 512 tokens),
  `laya-multilingual` (mmBERT-base, 322 M, más de 100 idiomas, hasta 8.192 tokens, el doble de rápido) y
  `laya-typed-decisions`.
- **Cómo lo corremos:** el servidor `native/laya/servidor-laya.mjs` (127.0.0.1:4470, `POST /v1/systemone`, formato
  de Jev) usa `@receptron/laya` (MIT), que ejecuta el checkpoint con ONNX Runtime. Su paquete ONNX publicado
  (`receptron/laya-onnx`) solo trae el checkpoint **inglés** (fp32, 1,6 GB). `laya-ts` (navegador con WebGPU →
  WASM, y Node) no está publicado en npm: vive en el repo de Laya.
- **Sus cifras de referencia** (33 ms por pregunta, 7,2 ms en lote) son en una GPU T4; no son las nuestras.

## 2. Medido hoy en el A1 (CPU Ampere de 2 núcleos, sin GPU)

| Prueba | Resultado |
|---|---|
| Carga del modelo (incluye descargar 1,6 GB la primera vez) | 28,5 s; ocupa 1,6 GB de RAM |
| Una petición con 3 preguntas (choice + score + noul) | **1,9 – 2,4 s** |
| Mismo texto en inglés y en español | elige bien en los dos, pero la confianza baja de 0,95 a 0,61 en español |
| «¿Contiene datos privados?» sobre un texto con teléfono y dinero | 0,25: **Laya no sirve como detector de privacidad** |

Por servidor (formato de `decision-hibrida.ts` y `jev.py`): ver §8.

**Conclusiones honestas:** en CPU, Laya tarda segundos, no milisegundos. Nunca bloquea la primera palabra de una
conversación: Needle 3 sigue siendo el reflejo instantáneo y Laya entra donde la decisión puede esperar, va en
paralelo o se agrupa en lote. Para el español hace falta exportar `laya-multilingual` a ONNX (fp32 e int8) y medir;
hasta entonces, sus respuestas en español cuentan con su confianza real, que es más baja.

## 3. Lo que ya existía y lo que estaba roto (arreglado hoy)

- **Ya existía:** `decision-hibrida.ts` (Needle → Laya → Jev → modelo grande, para elegir herramienta),
  `decisiones.ts` (`decidir`, `moderar`, `enrutar`, `intencion` por `/api/jev/systemone`), `jev.py` (el enjambre
  pregunta a Laya local antes que a Jev remoto), la capa «reflejo» de `reparto-de-modelo.ts` y la ficha en la Biblioteca.
- **Roto y arreglado hoy (commits 25da561a0 y ee4dd0fd1):**
  1. en la Mac la RAM libre salía 4 veces más pequeña (páginas de 16 KB contadas como de 4 KB) y Laya nunca se cargaba;
  2. el servidor pedía `subfolder: "multilingual"`, que no existe en el paquete ONNX publicado: **Laya local nunca
     llegó a responder** («reading 'max_len'»); ahora usa `Laya.load()` de 0.2.x o `LAYA_MODEL_DIR`;
  3. el Mando preguntaba por `/health` y el servidor solo tenía `/status`: Laya salía siempre caído.
- **Topes de tiempo que no casan con lo medido:** `jev.py` espera 1,5 s y `decision-hibrida` 6 s; en el A1 una
  petición de 3 preguntas tarda ~2 s. Los plazos pasan a salir de lo medido por medio (`plazo-aprendido.ts`).

## 4. Laya en cada capa (dónde decide y cómo)

| Punto de decisión | Pregunta de Laya | Si no llega a tiempo o duda |
|---|---|---|
| Reflejo: herramienta | `choice` entre herramientas (ya existe) | Jev remoto o modelo grande |
| Planificador de capas | `score` dificultad + `noul` «¿basta un modelo pequeño?» | reglas de `classifyTask` |
| Respuesta de BitNet/Bonsai/Needle | `noul` «¿la respuesta resuelve lo pedido?» | subir a la capa siguiente del plan |
| Decisiones básicas de 1,58 bits | la MISMA pregunta tipada a Laya y al modelo pequeño: si coinciden, vale; si no, manda Laya con confianza ≥ umbral; si no, se sube | lo que decida la regla determinista |
| Habilidad que aplica | `choice` entre habilidades (§5) + «ninguna» | ninguna habilidad |
| Moderación y publicación | `choice` publicar / revisar / rechazar (ya en `decisiones.ts`) | revisar (nunca publicar) |
| Privacidad | `noul` «¿contiene datos privados?» | **solo puede subir la privacidad, nunca bajarla**; mandan las reglas y lo que marque la persona |
| Voz y vídeo | tono y emoción para la voz; intención y formato para `video.componer` | lo de por defecto |
| Enjambre | medio y escritor para cada tarea (`jev_enrutado`) | orden determinista |

**Dónde corre Laya, por medio:** en el A1 siempre encendido para toda la cuenta de Alex (y para decisiones no privadas
de la red); en apps nativas y PWA con WebGPU, `laya-ts` con el checkpoint exportado; en la Mac de 8 GB, solo si hay
≥ 2,5 GB libres, si no por la malla al A1; en una visita web, por la malla. Lo privado nunca sale de las neuronas de
la persona ni de sus servidores propios.

## 5. Las skills de Matt Pocock en la IA de Astraura

- **Qué son:** 26 skills estables de ingeniería y productividad (licencia MIT): interrogar un plan (`grill-me`,
  `grilling`), especificar y trocear (`to-spec`, `to-tickets`, `triage`), TDD, diagnóstico de errores, modelo de
  dominio, diseño de módulos profundos, revisión de código, prototipos, investigación con fuentes, traspaso entre
  sesiones (`handoff`), enseñar (`teach`) y escribir para agentes.
- **Para nosotros:** instaladas como plugin «Skills For Real Engineers» del directorio de Anthropic (se sincroniza al
  Claude Code de la Mac).
- **Para Astraura:** copia en `vendor/habilidades/mattpocock-skills/` del commit 49dd158 (2026-10-09) del upstream
  `https://github.com/mattpocock/skills` — el que de verdad se copió, según `vendor/habilidades/mattpocock-skills/ORIGEN.md`
  (el commit de StarSeed que integró esta copia en el repo es el 546c06669 del 18-10-2026, no el del upstream) —
  convertida en capacidades con TRES tamaños, porque cada capa tiene su ventana:
  **tarjeta** (≤ 60 palabras, para Needle y BitNet), **resumen**
  (≤ 250 palabras, para Bonsai 1,7–4B) y **completa** (el texto original, para razón, profunda y nube). Laya elige
  qué habilidad aplica; el planificador elige el tamaño según la capa que va a responder.
- **En todos los contextos, automáticamente:** chats personales y de grupo, agentes, bots, Genesis y los escritores
  del enjambre (que reciben la tarjeta de TDD, diagnóstico o diseño según su tarea). Cada persona y ámbito puede
  apagarlas en Ajustes (misma herencia de capas).

## 6. Se mejora y se actualiza sola

- **Aprende de lo que pasa:** cada decisión guarda punto, probabilidad, dónde corrió, cuánto tardó y el resultado
  (aceptada, corregida, escalada); con ≥ 30 casos por punto y ámbito recalibra su umbral. Lo privado se guarda solo
  como huella, nunca el texto.
- **Afinado del modelo:** el conjunto de datos sale en JSONL para el cuaderno de afinado de Laya (GPU gratuita de
  Kaggle); ejecutarlo es una decisión de Alex.
- **Al día:** el vigía (VST1018M) vigila el repo de Laya, PyPI `laya`, sus checkpoints y `@receptron/laya`.

## 7. Tareas (Ola 1018L, `cola-laya-habilidades-1018.json`)

| Bloque | Tareas |
|---|---|
| Decisiones | A catálogo de puntos de decisión · B cliente único por medio con plazos medidos · C consenso con los modelos de 1,58 bits · D «¿basta la respuesta?» y escalado · E privacidad que solo sube |
| Capas y router | F planificador con Laya · G Laya por la malla (`capacidad.decision.laya`) · H Laya en navegador y apps con `laya-ts` |
| Habilidades | I tarjetas de ingeniería · J tarjetas de productividad · K elección por Laya y tamaño por capa · L habilidades en los escritores del enjambre |
| Aprendizaje y Ajustes | M registro y recalibrado · N panel «Decisiones de Laya» y habilidades en Ajustes · O exportar laya-multilingual a ONNX y medir |

Cada tarea toca como mucho 3 archivos y 120 líneas por archivo. Las escribe el enjambre; Claude dirige y verifica en
localhost y en el A1.

## 8. Medida por servidor en el A1

Servidor corregido (`@receptron/laya` 0.2.0, checkpoint inglés fp32) en el A1, a las 22:52 UTC, con el formato de `decision-hibrida.ts`: 3 preguntas en español (herramienta entre 3, «¿basta un modelo pequeño?», dificultad) sobre un mensaje de una línea. Primera petición 6,5 s (carga desde la caché + respuesta); las siguientes **3,1 – 3,2 s** cada una, siempre la misma respuesta (determinista), 1,6 GB de RAM. Queda corriendo en 127.0.0.1:4470 del A1 (se descarga tras 10 min sin uso); el arranque automático tras reinicio y el acceso desde otras neuronas son las tareas G y B. Con `laya-multilingual` (más pequeño) e int8: **sin medir** (tarea O).
