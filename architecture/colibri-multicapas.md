# Colibri · el motor nativo de las multicapas de conciencia de Astraura (CLB1027)

**Pedido de Alex (2026-10-27):** «este funcionamiento debe ser el nativo de las multicapas de conciencia automáticas de
la IA Astraura usando todos los sistemas disponibles, incluyendo los 1.58 bits, Cactus Needle, Bonsai, Jev, Laya,
herramientas, habilidades, conectores, personalidades, agentes, bots, Protomolécula, etc., y demás modelos compatibles,
y que los almacenamientos y capacidades lo permitan, automejorables, configurables; también en la librería
autoactualizable» — https://github.com/JustVugg/colibri

## 1. Qué es Colibri (medido el 2026-10-27)

- **Motor de inferencia en C puro** (Vincenzo Fornaro, **Apache-2.0**; componentes de terceros MIT en
  `THIRD_PARTY_NOTICES.md`). `v2.0.0` del 2026-10-06, commits hasta el 2026-10-17, 27 etiquetas desde `v1.6.2`.
- **Idea:** un modelo de mezcla de expertos (MoE) es enorme en disco y pequeño por token. Colibri deja en RAM la
  parte densa y lee del disco los expertos que el enrutador pide, con una **caché que aprende qué expertos usa tu
  trabajo**. Sin GPU obligatoria; Vulkan, CUDA y Metal (Apple Silicon) cuando conviene. Compila en ARM64 (el A1).
- **13 motores:** chat (Qwen3.6-35B-A3B, Qwen3-Coder-30B-A3B, OLMoE 7B, Qwen3.8-27B, Qwen3.8-Flash-Next, DeepSeek V4
  Flash y su REAP 150B, DeepSeek V4.1 Flash, MiMo-V2.6, GLM-5.2/5.3/5.3-Flash, Inkling, Kimi K3), imagen
  (Qwen-Image-2.1, **licencia no comercial**) y **decisión** (Laya, GLiNER2.5-Decide, Clef).
- **APIs:** OpenAI (`/v1/chat/completions`), Anthropic (`/v1/messages`), herramientas, imágenes, varias
  conversaciones a la vez, y **`POST /v1/systemone`: el mismo contrato que Jev** (decisión con probabilidad, sin
  generar texto). Servidor MCP para instalarlo desde un asistente. **Modo clúster:** trabajadores de expertos en otras
  máquinas por TCP, **sin autenticación ni cifrado propios** (solo en red privada).
- **Requisitos:** 8 GB de RAM como mínimo (16+ mejor) y 22 GB de disco para el modelo de chat más pequeño del
  instalador; Laya 0,85 GB de disco y 1,7 GB de RAM (219 ms por pregunta); GLiNER2.5-Decide 1,95 GB y 1,9 GB.
  **Puerto por defecto 8000**, que en las neuronas es el backend de Astraura 1.58: aquí va en **4480**.

## 2. Su papel: un motor más del catálogo de capas, no otro sistema

Las capas siguen siendo papeles (`architecture/capas-autoadaptables.md`); Colibri es un **runtime** (`"colibri"`)
que las cumple cuando la neurona tiene RAM y disco. El planificador (`src/lib/astraura/capas/planificador.ts`) elige
entre todos los motores: Needle 3 (reflejo), BitNet 1.58 (memoria y razón), Bonsai (palabra, razón, profunda),
**Colibri** y lo de la nube, por tarea, medio, privacidad y lo que cabe.

| Capa | Lo que aporta Colibri | Cabe hoy en… |
|---|---|---|
| **juicio** (capa nueva: decisiones con probabilidad; la trinidad reflejo → juicio → deliberación) | Laya → GLiNER2.5-Decide → Clef (este, solo con ≥ 19 GB de RAM) | el A1 (Laya + GLiNER: 2,8 GB de disco, 3,6 GB de RAM) |
| **palabra** | OLMoE 7B int8 (7 GB de disco, 8 GB de RAM) | ninguna con margen (el A1 la comparte con el enjambre) |
| **razón** | Qwen3-Coder-30B-A3B (código y herramientas; 19 GB, 8/18 GB de RAM) · Qwen3.6-35B-A3B (piensa y usa herramientas; 23 GB, 10/20 GB) | ninguna hoy |
| **profunda** | Los MoE grandes leídos del disco: DeepSeek V4 Flash REAP (85 GB, 16/32 GB), Qwen3.8-Flash-Next (186 GB, 24/32), GLM-5.2 (429 GB, 16/24) | una neurona con NVMe grande y ≥ 16 GB de RAM; o el clúster (§4) |

Qwen-Image-2.1 **no entra** en las capas: su licencia es no comercial (regla: nada no comercial en uso comercial).

## 3. Automático, configurable y automejorable

- **Automático:** cada neurona mide su RAM, disco, CPU y GPU (`src/lib/recursos-ia/`, `perfil-medio.ts`) y el
  catálogo dice qué modelo de Colibri cabe; el planificador lo usa solo si está instalado, verificado y encendido.
- **Configurable:** por neurona, cada motor y cada capa se encienden o apagan (Ajustes · Capas y Genesis · Capas);
  la carpeta de los modelos sale del medio de almacenamiento elegido para esa neurona
  (`architecture/recursos-ia-neurona.md`). Instalar un modelo es **siempre** con el visto bueno de la persona en sus
  neuronas (descarga de GB); en los servidores propios (el A1), con el de Alex una vez.
- **Automejorable:**
  1. la caché de expertos de Colibri aprende el uso de cada neurona (viene de serie);
  2. cada respuesta deja su medida (latencia, tokens por segundo, acierto del juicio confirmado con
     `decidir.py confirmar`) y el planificador **reordena los candidatos de cada capa por lo medido en esa neurona**;
  3. lo acertado alimenta el adaptador colectivo de Needle (ciclo nocturno que ya existe);
  4. la versión se sigue sola en la Biblioteca (`lib-colibri`, etiquetas `vX.Y.Z`): al salir una nueva, Genesis lo
     dice y el instalador recompila al siguiente arranque (`start-here.sh` recompila cuando cambian las fuentes).
- **Regla de las capas que se mantiene:** ninguna capa sin su SHA-256. Las entradas de Colibri entran
  «por-verificar» y el instalador anota el SHA de cada archivo descargado antes de pasarlas a «recomendado».

## 4. Con todo lo demás de Astraura

- **Jev:** `scripts/puente/jev.py` ya pregunta a un `/v1/systemone` local (`STARSEED_LAYA_URL`, Laya en
  `native/laya/servidor-laya.mjs`, puerto 4470). Colibri habla el mismo contrato: entra como otro extremo local
  (`STARSEED_SYSTEMONE_LOCALES`, el más rápido que responda), antes de OpenRouter. Nada cambia para quien llama.
- **Herramientas, habilidades, conectores, personalidades, agentes y bots:** van por la API OpenAI/Anthropic de
  Colibri como cualquier otro modelo del enrutador de Astraura (`src/ai/astraura/`), con el contexto de la personalidad
  y el ámbito; los permisos y la privacidad del planificador valen igual (lo privado nunca sale de las neuronas de la
  cuenta).
- **Protomolécula:** sus moléculas de texto, código y decisión eligen modelo por capa, así que usan Colibri cuando el
  planificador lo elige.
- **Mausbot** (`architecture/mausbot-astraura.md`): sus decisiones rápidas («¿este es el botón?», «¿pido permiso?»)
  van a la capa juicio.
- **Neuronas insomnes y clúster** (`architecture/neurona-insomne.md`): una neurona insomne de la MISMA cuenta puede ser
  trabajador de expertos de Colibri mientras dure su sesión. Como el transporte de Colibri no tiene autenticación ni
  cifrado, el clúster **solo** corre dentro de un túnel privado entre neuronas de la cuenta (WireGuard o la malla con
  cifrado); nunca por internet abierto. Es una ola propia, no esta.

## 5. Ola CLB1027 (≤ 3 archivos y ≤ 120 líneas por archivo y tarea)

Datos verificados de cada modelo en `config/capas-colibri-1027.json` (este commit). Orden: el catálogo acepta el
runtime y la capa juicio (A) → las entradas pasan al catálogo de capas (B) → recursos por neurona (C) → Jev con
varios extremos locales (D) → plan de instalación por neurona (E) → el A1 con Laya + GLiNER en Colibri (F) → medidas
que reordenan (G). Cola: `starseed_memory_root/olas/cola-mausbot-insomne-1027.json`.

**Verificación:** en el A1, `curl 127.0.0.1:4480/v1/systemone` con una pregunta de prueba; `jev.py` responde con
`medio: colibri-local` y su latencia; Genesis · Capas enseña las entradas de Colibri con «cabe / no cabe» por neurona
y el porqué; nada se descarga sin el visto bueno.
