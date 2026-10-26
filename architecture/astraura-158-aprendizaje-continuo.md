# SOP · Aprendizaje continuo y auto-mejora de Astraura 1.58

> **Adenda de la Ola 267 (2026-09-07).** Dirección de Alex: Astraura 1.58 aprende sola.
> Sistema nativo de aprendizaje continuo: agentes especializados que usan modelos 1.58-bit
> (locales o en la nube) para el autodesarrollo del OS y de Astraura; fine-tuning continuo y
> automático por personalidad, agente, bot 3D y proceso imaginativo, por **adaptadores LoRA**,
> nunca reentrenando el modelo base en la Mac. Manifiesto en código:
> `src/lib/astraura/aprendizaje/manifiesto.ts`.
>
> **Adenda de la Ola 1025U (2026-10-25).** La fábrica es intercambiable: además de QVAC y
> onebitllms entra **Soup** (§2.2.1) para bases estándar y preferencias, con el destino del
> adaptador por ámbito privado o colectivo (§2.2.2). Código puro, sin entrenar nada todavía:
> `fabricas.ts`, `soup.ts` y `destino-adaptador.ts` en `src/lib/astraura/aprendizaje/`.

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
  (misma regla de orquestación económica de Genesis); nadie agota sus créditos.
- **Aprobación humana heredada:** desplegar un adaptador nuevo puede pedir el visto bueno de
  Alex en Genesis, como cualquier ola.

## 2. Arquitectura en cinco capas

| Capa | Qué hace | Ola | Dónde corre |
|---|---|---|---|
| Corpus vivo | Captura, filtra y limpia datos de entrenamiento | 268 | Neurona (local) |
| Fábrica | Entrena adaptadores LoRA (QVAC/Metal; Soup en GPU gratuita) y refresca el base (onebitllms/GPU) | 269 · 1025U | Mac + nube GPU |
| Evaluación | Mide estilo, tool-calls, memoria y tareas; puerta de regresión | 270 | Neurona + nube gratis |
| Despliegue | Carga `--lora`, registro y rollback | 271 | Neurona + Genesis |
| Agentes | Cinco roles que operan el ciclo como olas de tipo `aprendizaje` | 268-272 | Orquestador de Genesis |

### 2.1 Corpus vivo

Fuentes de datos, todas **opt-in y filtradas**:

- Turnos de chat, separados por personalidad activa.
- Trazas de herramientas (tool-calls con sus argumentos normalizados).
- Salidas de `cognition.py` (imaginación, sueños, enjambre, Director Metis, cronista).
- Tomas de voz valoradas (cuando el usuario puntúa una respuesta hablada).
- Decisiones de Genesis (aprobaciones y rechazos de olas, con su motivo).

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

#### 2.2.1 Soup como fábrica (Ola 1025U)

**Qué es.** Soup (`soup-cli`, https://github.com/MakazhanAlpamys/Soup, Apache-2.0) afina modelos
de lenguaje desde **un solo YAML** (`soup.yaml`): SFT, preferencias (DPO, ORPO, KTO, SimPO, IPO),
refuerzo (GRPO, PPO), LoRA y QLoRA; además evalúa (`soup eval`), diagnostica el entorno
(`soup doctor`) y exporta a GGUF. Es la **tercera fábrica**, intercambiable con QVAC y
onebitllms (`MotorFabrica = "qvac" | "soup" | "onebitllms"` en `fabricas.ts`):

| Motor | Bases | Tareas | Dónde entrena |
|---|---|---|---|
| QVAC | BitNet 1.58 (TQ1_0 / TQ2_0) | SFT | Mac con Metal (8 GB), por turnos |
| **Soup** | Bases estándar de Hugging Face (Qwen, Llama, Gemma…) | SFT, DPO, ORPO, KTO | GPU con CUDA (Kaggle o Colab gratis); Apple Silicon solo con memoria de sobra |
| onebitllms | Modelos 1.58 pre-cuantizados | Fine-tuning completo del base | GPU NVIDIA de nube |

**Dónde corre cada cosa** (`elegirFabrica(medio, necesidad)` decide sin prometer de más):

| Medio | Con Soup |
|---|---|
| Mac de la fundación (8 GB, MPS) | **Prepara y valida** (datos, `soup.yaml`, `soup doctor`); no entrena: la casa pide 16 GB de memoria unificada para MPS |
| A1 de Oracle (ARM, 2 OCPU, 12 GB, sin GPU) | Prepara y valida; no entrena |
| Contenedor de GitHub (sin GPU) | Prepara y valida; no entrena |
| Kaggle o Colab (T4 / P100, ~15 GB de VRAM) | **Entrena** LoRA y QLoRA (guía de VRAM de Soup: 8 GB para ~7B, 16 GB para ~14B, 24 GB para ~34B, 48 GB para ~70B) |

Si lo pedido no tiene camino (por ejemplo preferencias sobre el BitNet), la decisión es
`sin-camino` con el motivo y no se inventa un plan. Los datos que salen de la neurona hacia una
GPU prestada exigen **consentimiento explícito** (§2.2.2).

**Configuración.** `configSoup(peticion)` genera el `soup.yaml` (SFT o DPO/ORPO/KTO; LoRA o
QLoRA; base de Hugging Face; datos del corpus por personalidad o agente, solo con sello de
consentimiento; rutas relativas, nunca `..` ni `.env`) y `validarConfigSoup` lo comprueba.
**Solo se escriben claves documentadas** (lista cerrada `CLAVES_SOUP`, con el documento de Soup
donde se comprobó cada una): Soup **0.75 rechaza las claves desconocidas** y la **0.76 los ajustes
que nunca aplicaba**, así que una clave inventada rompe el entrenamiento. Por eso el `export:`
del YAML no se escribe: el export va por orden. Ejemplo (SFT con QLoRA, tal como lo emite el código, sin sus comentarios ni líneas en blanco):

```yaml
base: Qwen/Qwen2.5-1.5B-Instruct
task: sft
data:
  train: ./data/aprendizaje/corpus/aurora-sabia/train.jsonl
  format: chatml
  val_split: 0.1
  max_length: 2048
training:
  epochs: 3
  lr: 2e-5
  batch_size: auto
  lora:
    r: 16
    alpha: 32
    dropout: 0.05
    target_modules: auto
  quantization: 4bit
output: ./output/personalidad-aurora-sabia
```

**Órdenes** (`comandosSoup(config)`; se muestran, no se ejecutan desde el OS):

```bash
pip install "soup-cli[train]==0.76.1"      # comillas dobles; Python 3.11 o 3.12
soup doctor --config soup.yaml              # valida claves y entorno ANTES de entrenar
soup data validate ./data/.../train.jsonl --format chatml
soup train --config soup.yaml
soup adapters check ./output/personalidad-aurora-sabia
soup eval custom --model ./output/personalidad-aurora-sabia --tasks eval.jsonl
soup export --model ./output/personalidad-aurora-sabia --format gguf --quant q4_k_m
```

`guionKaggleColab(...)` entrega lo mismo como guion de celdas (`# %%`) para Kaggle o Colab: comprueba
la versión de Python, incrusta el YAML, pide subir el corpus como **dataset privado** y usa los
secretos del propio servicio; nunca lleva una clave escrita.

**Límites honestos** (verificados contra el repositorio, la documentación y PyPI el 2026-10-25):

- **No se ha entrenado nada con Soup todavía.** Lo hecho es la elaboración y validación del plan; el
  primer adaptador real es el hito `fabrica-soup-gpu` (pendiente) y pasa por la puerta de regresión (§2.3).
- **Python:** el README dice 3.11 a 3.13, pero el paquete `soup-cli` 0.76.1 de PyPI declara `>=3.10,<3.13`.
  Se usa **3.11 o 3.12**.
- **`soup export --format gguf` fusiona el adaptador con su base** y deja un **GGUF completo y
  cuantizado**, no un adaptador. Un adaptador GGUF aparte (para `llama-server --lora`) sale de
  `convert_lora_to_gguf.py` de llama.cpp, que no es de Soup; en el plan va marcado «fuera de Soup» y
  debe comprobarse con la versión de llama.cpp en uso.
- **Un adaptador de Soup no se carga sobre el BitNet 1.58:** se entrena sobre una base estándar y solo
  sirve con esa base. El `--lora` de QVAC y los de Soup son familias distintas (`adaptadorCompatibleConBase`).
- **QLoRA (4 bits) es solo CUDA.** En MPS o CPU se escribe LoRA sin cuantizar y el plan avisa.
- **Versión que se sigue:** el canal de la ficha es el de **commits** (SHA de `main`), porque las
  «Releases» de GitHub van semanas por detrás (la última marcada es la v0.73.3 frente a la 0.76.1 de
  PyPI) y la API de etiquetas ordena por nombre, no por versión. La versión publicada se anota aparte.

#### 2.2.2 Destino de la personalización

`planificarAdaptador(peticion)` (`destino-adaptador.ts`) convierte el resultado de una fábrica en un
**adaptador registrado** para una personalidad, un agente, un bot o una capa de conciencia, con la
misma forma de entrada que ya lee Genesis (`adaptadores.json`: `id`, `personalidad`, `fecha`, más
motor, base, formato, estado `candidato` y `requiereEvaluacion`). Nunca nace activo: pasa por la
puerta de regresión (§2.3) y por el despliegue (§2.4).

| | Privado (personal) | Colectivo (público) |
|---|---|---|
| Para quién | La persona y sus agentes personales (personalidad, bot o capa propios) | Agentes de grupo, agentes públicos y la capa de conciencia colectiva |
| Datos que puede ver | Memoria personal, de perfil, de grupo y pública (con sello de consentimiento por archivo) | **Solo pública**, y de grupo solo con la aprobación de la entidad |
| Memoria personal o de perfil | Permitida con consentimiento | **Rechazada con error** (no se filtra en silencio) |
| Quién lo carga | Solo quien podría leer ese dato (`puedeUsarAdaptador`) | Quien pueda leer su alcance (público, grupo) |
| Fuera del aparato | Pide `autorizaNube` explícito (GPU prestada, capa servida en nube o mesh) | Igual para el archivo; sin datos personales |

Reglas del contrato (`src/lib/nucleo/alcance-memoria.ts`: personal › perfil › grupo › pública, nunca
al revés): el **alcance del adaptador es el del dato más privado que vio**; un adaptador privado jamás
lo carga un agente de grupo o público; las fuentes sin sello de consentimiento se dejan fuera y, si no
queda ninguna, no hay entrenamiento; un agente de grupo declara su grupo; la capa de conciencia
colectiva es colectiva aunque la lance una persona. Para mezclar memoria personal en algo público no hay
atajo: se entrenan **dos adaptadores distintos**, uno privado y otro colectivo.

Todavía no hay pantalla para este plan: está en código con pruebas puras. La pestaña «Aprendizaje» de
Genesis (§3) lo mostrará cuando se conecte el primer entrenamiento real.

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
`aprendizaje`** del orquestador de Genesis, interconectados con sus procesos y tareas:

| Agente | Rol | Modelo preferido |
|---|---|---|
| Curador | Captura, privacidad y limpieza del corpus | bitnet-local |
| Entrenador | Fabrica adaptadores QVAC y coordina el refresco del base | bitnet-local |
| Evaluador | Ejecuta los conjuntos y la puerta de regresión | nube-gratis |
| Desplegador | Carga `--lora`, registro y rollback | bitnet-local |
| Cronista | Bitácora y adendas de cada ciclo | nube-gratis |

Lo barato (curar, etiquetar, despachar) va al **BitNet local**; lo difícil (juzgar estilo,
redactar informes largos) va a los **modelos gratuitos de la nube** con la misma lógica de
relevo ante 429/402 del orquestador. Cada ciclo respeta la aprobación humana de Genesis.

## 3. Integración con el OS

- **Personalidades** (`src/lib/aurora/personalities.ts`): cada una gana un campo `adaptador`
  que apunta al GGUF activo; el router de inteligencia lo pasa al llama-server al arrancar la
  sesión.
- **Bots 3D y procesos imaginativos:** `cognition.py` (imaginación, sueños, enjambre, Metis,
  cronista) escribe sus mejores salidas al corpus con la personalidad que las produjo.
- **Botones de valoración** en el chat (pulgar arriba/abajo por turno): la valoración y el
  turno se sellan al corpus; solo entran al entrenamiento los turnos con valoración positiva
  o corrección del usuario.
- **Pestaña «Aprendizaje» de Genesis:** estado de los cinco agentes, progreso por fase
  (`progresoAprendizaje()`), última evaluación, adaptador activo por personalidad y botones
  de aprobar/revertir para los despliegues con `aprobacion: true`.

## 4. Plan por olas

| Ola | Capa | Criterio de verificación |
|---|---|---|
| 268 | Corpus vivo | JSONL por personalidad con filtro de privacidad y limpieza Falcon; test de que ningún corpus contiene patrones de claves |
| 269 | Fábrica | Un adaptador LoRA real entrenado en la Mac con QVAC para una personalidad piloto; receta onebitllms reproducible documentada |
| 1025U | Fábrica Soup | Hecho: elección por medio, `soup.yaml` validado, órdenes y destino por ámbito (pruebas puras). Pendiente (`fabrica-soup-gpu`): un adaptador real entrenado con Soup en Kaggle o Colab y pasado por la puerta de regresión |
| 270 | Evaluación | Conjuntos por personalidad + puerta de regresión funcionando; un adaptador rechazado de verdad demuestra la puerta |
| 271 | Despliegue + Genesis | Carga `--lora`, registro con rollback y pestaña «Aprendizaje» |
| 272 | Integración OS | Personalidades con `adaptador`, valoraciones alimentando el corpus, bots 3D escribiendo |

## 5. Límites honestos

- **8 GB de RAM:** solo adaptadores pequeños, un entrenamiento a la vez y por turnos; la
  sesión ligera es la norma mientras se entrena.
- **El base no se toca en la Mac:** el fine-tuning completo con onebitllms exige GPU NVIDIA;
  va a la nube con cuentas de Alex (Kaggle/Colab o alquiler puntual) y vuelve como GGUF.
- **Soup no entrena en la Mac de 8 GB ni en el A1 (sin GPU):** ahí solo prepara y valida; entrenar es cosa
  de la GPU gratuita de Kaggle o Colab, con el corpus subido como dataset privado y con consentimiento.
- **Soup y BitNet no se mezclan:** los adaptadores de Soup viven sobre bases estándar de Hugging Face.
- **MLX no es ternario:** sirve para experimentar y para auxiliares 4-bit, no para el motor 1.58.
- **Los corpus crecen despacio al principio:** sin valoraciones suficientes, el evaluador
  retiene los ciclos en vez de fabricar señal falsa.

## 6. Fuentes (verificadas el 2026-09-07; Soup el 2026-10-25)

1. QVAC Fabric BitNet — https://github.com/tetherto/qvac-rnd-fabric-llm-bitnet (Apache-2.0):
   inferencia TQ1_0/TQ2_0 en Metal/Vulkan/CPU y `llama-finetune-lora` en el dispositivo.
2. onebitllms — https://github.com/tiiuae/onebitllms (TII): fine-tuning completo de 1.58
   pre-cuantizados, solo GPU NVIDIA; inferencia con bitnet.cpp.
3. MLX — https://github.com/ml-explore/mlx (MIT): framework de Apple Silicon; sin kernels 1.58.
4. Falcon harness engineering guide — https://falcon-lm.github.io/tutorials/harness-engineering-guide:
   LoRA rango 16 (~0,6 % de parámetros), limpieza de trazas, split 80/10/10, smoke tests GGUF.
5. Soup — https://github.com/MakazhanAlpamys/Soup (Apache-2.0; `soup-cli` 0.76.1 en PyPI,
   2026-10-14): fine-tuning desde un YAML, claves desconocidas rechazadas desde la 0.75 y ajustes
   sin efecto desde la 0.76, export a GGUF fusionado, Python 3.11 o 3.12 en PyPI.
