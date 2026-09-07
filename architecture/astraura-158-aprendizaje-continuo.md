# SOP · Aprendizaje continuo y auto-mejora de Astraura 1.58

> **Adenda de la Ola 267 (2026-09-07).** Dirección de Alex: Astraura 1.58 aprende sola.
> Sistema nativo de aprendizaje continuo: agentes especializados que usan modelos 1.58-bit
> (locales o en la nube) para el autodesarrollo del OS y de Astraura; fine-tuning continuo y
> automático por personalidad, agente, bot 3D y proceso imaginativo, por **adaptadores LoRA**,
> nunca reentrenando el modelo base en la Mac. Manifiesto en código:
> `src/lib/astraura/aprendizaje/manifiesto.ts`.

---

## 1. Propósito y principios

Cada personalidad, agente, bot 3D y proceso de imaginación del OS **aprende de su propio
contexto** y mejora con el tiempo. El mecanismo son **adaptadores LoRA GGUF** que se cargan
junto al BitNet b1.58 base; el base solo se refresca en la nube, nunca en la Mac.

- **Soberanía:** los datos de entrenamiento **no salen de la neurona** salvo consentimiento
  explícito del usuario. El refresco del base en la nube usa solo corpus anonimizado y opt-in.
- **Propiedad:** el usuario es dueño de cada adaptador; puede exportarlo, borrarlo o
  desactivarlo. Son archivos GGUF pequeños, no servicios.
- **Sin secretos:** el filtro de privacidad garantiza que **nunca** entran claves, tokens ni
  rutas de `.env` al corpus. El corpus cita nombres de variables, no valores.
- **Gratis primero:** el ciclo corre con el BitNet local y modelos gratuitos de la nube
  (misma regla de orquestación económica del Mando); nadie agota sus créditos.
- **Aprobación humana heredada:** desplegar un adaptador nuevo puede pedir el visto bueno de
  Alex en el Mando, como cualquier ola.

## 2. Arquitectura en cinco capas

| Capa | Qué hace | Ola | Dónde corre |
|---|---|---|---|
| Corpus vivo | Captura, filtra y limpia datos de entrenamiento | 268 | Neurona (local) |
| Fábrica | Entrena adaptadores LoRA (QVAC/Metal) y refresca el base (onebitllms/GPU) | 269 | Mac + nube GPU |
| Evaluación | Mide estilo, tool-calls, memoria y tareas; puerta de regresión | 270 | Neurona + nube gratis |
| Despliegue | Carga `--lora`, registro y rollback | 271 | Neurona + Mando |
| Agentes | Cinco roles que operan el ciclo como olas de tipo `aprendizaje` | 268-272 | Orquestador del Mando |

### 2.1 Corpus vivo

Fuentes de datos, todas **opt-in y filtradas**:

- Turnos de chat, separados por personalidad activa.
- Trazas de herramientas (tool-calls con sus argumentos normalizados).
- Salidas de `cognition.py` (imaginación, sueños, enjambre, Director Metis, cronista).
- Tomas de voz valoradas (cuando el usuario puntúa una respuesta hablada).
- Decisiones del Mando (aprobaciones y rechazos de olas, con su motivo).

Formato: **JSONL** en `data/aprendizaje/corpus/<personalidad>/AAAA-MM.jsonl`, un archivo por
personalidad y mes. Antes de escribir: filtro de privacidad (sin claves, sin correos salvo el
propio opt-in, sin datos biométricos) y sello de consentimiento por entrada.

Limpieza según la guía Falcon: quitar mensajes vacíos, quitar razonamiento intermedio si no
aporta, normalizar rutas, descartar trazas de más de 32k tokens, **split 80/10/10 por base de
código o contexto** para evitar fugas entre entrenamiento y evaluación, y máscara
solo-asistente (SFT estricto: nunca se entrena sobre lo que escribió el usuario).

### 2.2 Fábrica

- **En la Mac (adaptadores):** QVAC Fabric BitNet (`qvac-fabric-llm.cpp`, fork de llama.cpp,
  Apache-2.0) con su `llama-finetune-lora -m modelo.tq2_0.gguf -f train.jsonl
  --output-adapter adapter.gguf -ngl 999` sobre Metal. Con 8 GB se entrena **por turnos de
  memoria**: un adaptador cada vez, modelos i2_s/TQ pequeños, aprovechando que BitNet-13B
  cabe en 2,8 GiB. Referencia QVAC: una época tarda de 3,5 min (RTX 4090) a 1 h 45 min
  (iPhone 16); la Mac queda en medio, y por eso se entrena de noche o con sesión light.
- **En la nube (base):** onebitllms (TII) para fine-tuning completo de modelos 1.58
  pre-cuantizados (`replace_linear_with_bitnet_linear()` → entrenar → `quantize_to_1bit()`,
  kernels Triton). **Solo GPU NVIDIA** (ejemplo del repo: 8×A10G, 8,5 h); se ejecuta en GPU
  alquilada o gratuita (Kaggle/Colab, cuentas de Alex) y produce un nuevo base que baja a la
  neurona por el canal de despliegue.
- **MLX** queda como banco de experimentos y para auxiliares 4-bit (Whisper, difusión):
  no tiene kernels ternarios 1.58, así que no es el motor principal.

### 2.3 Evaluación

Conjuntos de prueba por personalidad, versionados junto al corpus:

| Eje | Qué mide |
|---|---|
| Estilo | La personalidad suena a sí misma (juez: modelo gratis de la nube) |
| Formato de tool-call | JSON válido y con el esquema exacto («tool calling is format-sensitive») |
| Recuerdo de memoria | Recupera hechos del `starseed_memory_root` y de la memoria de la neurona |
| Tareas del OS | Resuelve tareas reales de su dominio (navegación, voz, imaginación) |

**Puerta de regresión:** un adaptador solo sale si no empeora ningún eje respecto al
adaptador anterior (o al base si es el primero), en el mismo espíritu binario que
`verificar-neurona`. Smoke tests antes de producción: endpoint vivo, chat normal y un
tool-call JSON, servidos vía llama-server OpenAI-compatible.

### 2.4 Despliegue

- llama-server carga adaptadores con `--lora <archivo.gguf>` (uno activo por personalidad o
  contexto; se intercambian por sesión).
- Registro en `starseed_memory_root/aprendizaje/adaptadores.json`: id, personalidad, base,
  fecha, métricas de evaluación, estado (activo, retirado) y ruta del GGUF.
- **Rollback:** si una versión falla, se desactiva su entrada y se vuelve al adaptador previo;
  nada se borra sin orden.

### 2.5 Agentes del aprendizaje

Cinco roles (definidos en `AGENTES_APRENDIZAJE`), que corren como **olas de tipo
`aprendizaje`** del orquestador del Mando, interconectados con sus procesos y tareas:

| Agente | Rol | Modelo preferido |
|---|---|---|
| Curador | Captura, privacidad y limpieza del corpus | bitnet-local |
| Entrenador | Fabrica adaptadores QVAC y coordina el refresco del base | bitnet-local |
| Evaluador | Ejecuta los conjuntos y la puerta de regresión | nube-gratis |
| Desplegador | Carga `--lora`, registro y rollback | bitnet-local |
| Cronista | Bitácora y adendas de cada ciclo | nube-gratis |

Lo barato (curar, etiquetar, despachar) va al **BitNet local**; lo difícil (juzgar estilo,
redactar informes largos) va a los **modelos gratuitos de la nube** con la misma lógica de
relevo ante 429/402 del orquestador. Cada ciclo respeta la aprobación humana del Mando.

## 3. Integración con el OS

- **Personalidades** (`src/lib/aurora/personalities.ts`): cada una gana un campo `adaptador`
  que apunta al GGUF activo; el router de inteligencia lo pasa al llama-server al arrancar la
  sesión.
- **Bots 3D y procesos imaginativos:** `cognition.py` (imaginación, sueños, enjambre, Metis,
  cronista) escribe sus mejores salidas al corpus con la personalidad que las produjo.
- **Botones de valoración** en el chat (pulgar arriba/abajo por turno): la valoración y el
  turno se sellan al corpus; solo entran al entrenamiento los turnos con valoración positiva
  o corrección del usuario.
- **Pestaña «Aprendizaje» del Mando:** estado de los cinco agentes, progreso por fase
  (`progresoAprendizaje()`), última evaluación, adaptador activo por personalidad y botones
  de aprobar/revertir para los despliegues con `aprobacion: true`.

## 4. Plan por olas

| Ola | Capa | Criterio de verificación |
|---|---|---|
| 268 | Corpus vivo | JSONL por personalidad con filtro de privacidad y limpieza Falcon; test de que ningún corpus contiene patrones de claves |
| 269 | Fábrica | Un adaptador LoRA real entrenado en la Mac con QVAC para una personalidad piloto; receta onebitllms reproducible documentada |
| 270 | Evaluación | Conjuntos por personalidad + puerta de regresión funcionando; un adaptador rechazado de verdad demuestra la puerta |
| 271 | Despliegue + Mando | Carga `--lora`, registro con rollback y pestaña «Aprendizaje» |
| 272 | Integración OS | Personalidades con `adaptador`, valoraciones alimentando el corpus, bots 3D escribiendo |

## 5. Límites honestos

- **8 GB de RAM:** solo adaptadores pequeños, un entrenamiento a la vez y por turnos; la
  sesión ligera es la norma mientras se entrena.
- **El base no se toca en la Mac:** el fine-tuning completo con onebitllms exige GPU NVIDIA;
  va a la nube con cuentas de Alex (Kaggle/Colab o alquiler puntual) y vuelve como GGUF.
- **MLX no es ternario:** sirve para experimentar y para auxiliares 4-bit, no para el motor 1.58.
- **Los corpus crecen despacio al principio:** sin valoraciones suficientes, el evaluador
  retiene los ciclos en vez de fabricar señal falsa.

## 6. Fuentes (verificadas el 2026-09-07)

1. QVAC Fabric BitNet — https://github.com/tetherto/qvac-rnd-fabric-llm-bitnet (Apache-2.0):
   inferencia TQ1_0/TQ2_0 en Metal/Vulkan/CPU y `llama-finetune-lora` en el dispositivo.
2. onebitllms — https://github.com/tiiuae/onebitllms (TII): fine-tuning completo de 1.58
   pre-cuantizados, solo GPU NVIDIA; inferencia con bitnet.cpp.
3. MLX — https://github.com/ml-explore/mlx (MIT): framework de Apple Silicon; sin kernels 1.58.
4. Falcon harness engineering guide — https://falcon-lm.github.io/tutorials/harness-engineering-guide:
   LoRA rango 16 (~0,6 % de parámetros), limpieza de trazas, split 80/10/10, smoke tests GGUF.
