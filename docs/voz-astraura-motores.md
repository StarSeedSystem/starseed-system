# La voz de Astraura · motores, cuantización y el camino al 1,58-bit

*Adenda 217 · 2026-09-02*

## Lo que corre HOY en esta máquina

| Pieza | Estado |
|---|---|
| Motor | **OmniVoice** (k2-fsa) portado a **llama.cpp/ggml** → `omnivoice.cpp` |
| Formato | **GGUF Q8_0** · 656 MB modelo + 289 MB códec |
| Aceleración | Metal en Apple Silicon; CPU puro en cualquier otro equipo |
| Daemon | `native/astraura-voice/daemon.mjs` en `127.0.0.1:4444`, con pool de servidores persistentes y caché de WAV por hash |
| Capacidades | Español nativo, clonación por referencia (`refs/aurora.wav`), instrucción de estilo, 24 kHz |
| Medido | 3,1 s de audio en **7,6 s en frío** (incluye cargar el modelo) · 3 s en **~11 s caliente** en un M1 de 8 GB (RTF ≈ 3,9) |

**Por qué llevaba días mudo:** la configuración apuntaba a `Q4_K_M`, pero el
binario solo carga `F32 / BF16 / Q8_0`. Cada síntesis moría a los 180 s. Con
`Q8_0` —que ya estaba descargado— funciona a la primera.

**Cómo se consigue «instantáneo» con un RTF de 3,9:** anticipando. Los textos
del rito se conocen de antemano; mientras lees un paso, los dos siguientes ya
se están sintetizando y el daemon los cachea. Al llegar, el audio está. Solo la
primera frase de todas se espera —con la semilla girando y la insignia
«preparando voz…»—.

## Chatterbox (Resemble AI) — qué aporta y cómo encaja

Chatterbox es un TTS de 0,5 B de parámetros sobre un *backbone* Llama, con dos
cosas que Alex quiere y que vale la pena adoptar:

1. **Control de exageración emocional** (`exaggeration`) y de fidelidad al
   texto (`cfg_weight`): un dial de expresividad.
2. **Clonación zero-shot** con unos segundos de referencia.

Y una limitación que hay que decir clara: **es PyTorch**. No existe un port a
GGUF/llama.cpp, así que hoy corre en GPU (o en CPU muy despacio) y arrastra
~2 GB de dependencias y ~1,5 GB de pesos en su versión multilingüe. En este Mac
(8 GB de RAM, 4,9 GB libres de disco) cabe justo, sin margen.

**Lo que se ha integrado de Chatterbox sin esperar a su port:** su idea. Cada
timbre lleva ahora una **instrucción de estilo** (`local.instruct`: «cálida,
cercana y serena…», «voz masculina grave y segura…») que el motor local recibe
como su dial de expresividad, y una **referencia de clonación** para los
timbres que la piden. Es el mismo control, sobre el motor que sí corre aquí.

**Cuando se quiera Chatterbox de verdad**, el encaje es un segundo daemon
(FastAPI + `chatterbox-tts`, Python 3.11 —ya instalado—) detrás del mismo
contrato `POST /tts`, y el OS elige entre ambos por disponibilidad. El adaptador
del OS (`motor-local.ts`) no cambia.

## VoxCPM (OpenBMB) — qué aporta

VoxCPM (0,5 B, *tokenizer-free*, difusión-autoregresivo) destaca en **prosodia
consciente del contexto**: entona según el sentido de la frase, no solo según
la puntuación. Es exactamente lo que hoy se imita a mano en `voz-rito.ts`
(declinación entonativa, apertura cálida, subida en preguntas). También es
PyTorch, misma situación que Chatterbox. Encaja igual: un daemon detrás de
`POST /tts`.

## El 1,58-bit — la verdad técnica

**Lo que NO se puede hacer:** tomar Chatterbox o VoxCPM ya entrenados y
«cuantizarlos a 1,58 bits». La cuantización ternaria (pesos −1/0/+1) aplicada
*después* del entrenamiento destruye la calidad de un modelo de voz: no es un
redondeo como Q8 o Q4, es tirar casi toda la información de cada peso.

**Lo que SÍ es el camino (BitNet b1.58):** entrenar —o afinar— el modelo con
*quantization-aware training*, de modo que aprenda a funcionar con pesos
ternarios desde dentro. Para Chatterbox eso significa afinar su *backbone* T3
(la parte Llama) con QAT ternario, manteniendo el vocoder en Q8. Es un proyecto
de entrenamiento con GPU y datos de voz en español, no una conversión.

**El escalón realista hoy**, que ya está dado: **GGUF Q8_0 en llama.cpp**. Es
la misma arquitectura de ejecución que usará el 1,58-bit cuando exista
(ggml ya tiene kernels ternarios `TQ1_0` / `TQ2_0`), corre en CPU en cualquier
equipo, y es lo que hace que la voz de Astraura suene igual en un Mac, un
Windows o un Linux. Cuando haya un checkpoint BitNet de un TTS en español, se
convierte a `TQ2_0` y cae en el mismo daemon sin tocar el OS.

## Resumen de una línea

Hoy: voz neuronal local cuantizada (Q8_0, llama.cpp), con el dial de estilo de
Chatterbox y la entonación por contexto de VoxCPM llevados al motor que sí
corre aquí. Mañana: mismo daemon, checkpoint ternario.
