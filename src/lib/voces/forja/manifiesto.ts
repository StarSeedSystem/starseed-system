export interface ModeloFuente {
  id: string;
  nombre: string;
  repo: string;
  licencia: string;
  licenciaPesos?: string;
  arquitectura: string;
  idiomas: string;
  estado: "en-uso" | "candidato-principal" | "candidato" | "descartado-para-producto";
  queTomamos: string;
  motivo: string;
  verificado: boolean;
}

export const MODELOS_FUENTE: ModeloFuente[] = [
  {
    id: "omnivoice",
    nombre: "OmniVoice (k2-fsa)",
    repo: "https://github.com/k2-fsa/OmniVoice",
    licencia: "Apache-2.0",
    arquitectura: "LLM de tokens de audio + códec neuronal, GGUF vía omnivoice.cpp (Q8_0/Q4_K_M), instrucción de estilo y clonación por referencia",
    idiomas: "multilingüe con español",
    estado: "en-uso",
    queTomamos: "motor de inferencia GGUF (omnivoice.cpp) que ya corre en el demonio local 127.0.0.1:4444, el esquema de 'instruct' por timbre y la semilla determinista por personalidad",
    motivo: "es la voz neuronal que ya suena en el OS",
    verificado: false
  },
  {
    id: "kokoro",
    nombre: "Kokoro-82M",
    repo: "https://github.com/hexgrad/kokoro",
    licencia: "Apache-2.0",
    arquitectura: "StyleTTS2 destilado, 82M parámetros, ONNX/WASM en navegador",
    idiomas: "inglés (español experimental)",
    estado: "en-uso",
    queTomamos: "la vía WASM en navegador (nivel 'ligera') y el diseño de voces por vector de estilo (`voice` + `speed`)",
    motivo: "cero servidor",
    verificado: false
  },
  {
    id: "voxcpm",
    nombre: "VoxCPM (OpenBMB)",
    repo: "https://github.com/OpenBMB/VoxCPM",
    licencia: "Apache-2.0",
    arquitectura: "TTS sin tokenizador (diffusion autoregresiva sobre un LM MiniCPM)",
    idiomas: "chino e inglés",
    estado: "candidato",
    queTomamos: "la idea de sintetizar en espacio continuo (sin códec discreto) para el módulo acústico",
    motivo: "calidad, pero sin español nativo",
    verificado: false
  },
  {
    id: "orpheus",
    nombre: "Orpheus TTS (Canopy Labs)",
    repo: "https://github.com/canopyai/Orpheus-TTS",
    licencia: "Apache-2.0",
    arquitectura: "Llama-3B como LM de tokens SNAC, emociones por etiquetas, streaming",
    idiomas: "inglés y modelos multilingües (incluye español)",
    estado: "candidato-principal",
    queTomamos: "la receta 'LM de texto → tokens de audio' sobre un backbone Llama, que es exactamente lo que BitNet b1.58 puede cuantizar a ternario; las etiquetas de emoción para las variaciones por personalidad",
    motivo: "es el camino más directo a un modelo acústico 1.58-bit",
    verificado: false
  },
  {
    id: "fish-speech",
    nombre: "Fish-Speech / OpenAudio",
    repo: "https://github.com/fishaudio/fish-speech",
    licencia: "Apache-2.0",
    licenciaPesos: "CC-BY-NC-SA-4.0",
    arquitectura: "LM dual-AR + códec VQ (firefly)",
    idiomas: "multilingüe con español",
    estado: "descartado-para-producto",
    queTomamos: "solo patrones de código (streaming por trozos), nunca sus pesos",
    motivo: "pesos no comerciales",
    verificado: false
  },
  {
    id: "chatterbox",
    nombre: "Chatterbox (Resemble AI)",
    repo: "https://github.com/resemble-ai/chatterbox",
    licencia: "MIT",
    arquitectura: "Llama-500M de tokens + control de exageración emocional, marca de agua PerTh",
    idiomas: "inglés (versión multilingüe con español)",
    estado: "candidato",
    queTomamos: "el control continuo de 'exageración/intensidad' como ajuste de personalización por voz",
    motivo: "MIT y ajuste expresivo",
    verificado: false
  },
  {
    id: "f5-tts",
    nombre: "F5-TTS",
    repo: "https://github.com/SWivid/F5-TTS",
    licencia: "MIT",
    licenciaPesos: "CC-BY-NC-4.0",
    arquitectura: "flow matching con DiT, sin fonemas",
    idiomas: "inglés y chino",
    estado: "descartado-para-producto",
    queTomamos: "la referencia de flow matching para un vocoder ligero",
    motivo: "pesos no comerciales",
    verificado: false
  },
  {
    id: "cosyvoice",
    nombre: "CosyVoice 2 (FunAudioLLM)",
    repo: "https://github.com/FunAudioLLM/CosyVoice",
    licencia: "Apache-2.0",
    arquitectura: "LM de tokens semánticos + flow matching + HiFT vocoder, streaming",
    idiomas: "multilingüe (español limitado)",
    estado: "candidato",
    queTomamos: "la separación tokens semánticos → flow matching → vocoder como arquitectura de referencia del programa único",
    motivo: "modularidad",
    verificado: false
  },
  {
    id: "gpt-sovits",
    nombre: "GPT-SoVITS",
    repo: "https://github.com/RVC-Boss/GPT-SoVITS",
    licencia: "MIT",
    arquitectura: "clonación con 1 min de audio, VITS + GPT",
    idiomas: "chino, inglés, japonés, coreano",
    estado: "candidato",
    queTomamos: "el flujo de clonación con poco audio para el editor de voces (fase 4)",
    motivo: "MIT",
    verificado: false
  },
  {
    id: "openvoice",
    nombre: "OpenVoice V2 (MyShell)",
    repo: "https://github.com/myshell-ai/OpenVoice",
    licencia: "MIT",
    arquitectura: "conversión de timbre sobre una voz base (tone color converter)",
    idiomas: "inglés, español, francés, chino, japonés, coreano",
    estado: "candidato",
    queTomamos: "el conversor de timbre como capa de 'variación por personalidad' sin reentrenar el modelo acústico",
    motivo: "MIT y español",
    verificado: false
  },
  {
    id: "dia",
    nombre: "Dia (Nari Labs)",
    repo: "https://github.com/nari-labs/dia",
    licencia: "Apache-2.0",
    arquitectura: "1.6B, diálogo multi-hablante con etiquetas no verbales",
    idiomas: "inglés",
    estado: "candidato",
    queTomamos: "etiquetas no verbales (risa, suspiro) para la expresividad de personalidades",
    motivo: "Apache-2.0",
    verificado: false
  },
  {
    id: "kitten-tts",
    nombre: "KittenTTS",
    repo: "https://github.com/KittenML/KittenTTS",
    licencia: "Apache-2.0",
    arquitectura: "15M parámetros, CPU",
    idiomas: "inglés",
    estado: "en-uso",
    queTomamos: "nada nuevo; referencia de tamaño mínimo",
    motivo: "ya integrado como reserva",
    verificado: false
  },
  {
    id: "bitnet",
    nombre: "BitNet b1.58 (Microsoft)",
    repo: "https://github.com/microsoft/BitNet",
    licencia: "MIT",
    arquitectura: "inferencia ternaria (bitnet.cpp) y recetas de entrenamiento 1.58-bit",
    idiomas: "n/a",
    estado: "en-uso",
    queTomamos: "el motor de inferencia ternario y la receta de cuantización consciente del entrenamiento (QAT) para el modelo acústico",
    motivo: "es el núcleo 1.58 de Astraura",
    verificado: false
  },
  {
    id: "vibevoice",
    nombre: "VibeVoice (Microsoft)",
    repo: "https://github.com/microsoft/VibeVoice",
    licencia: "MIT",
    arquitectura: "familia TTS+ASR: tokenizadores continuos a 7,5 Hz + LLM (Qwen2.5) + cabeza de difusión; Realtime-0.5B en streaming con español; ASR-BitNet ternario 1.58-bit",
    idiomas: "TTS multilingüe con español (Realtime-0.5B), ASR 50+",
    estado: "candidato-principal",
    queTomamos: "VibeVoice-ASR-BitNet como reconocimiento de voz ternario del programa único (primer módulo 1.58-bit real) y Realtime-0.5B como candidato a TTS en streaming",
    motivo: "es el único sistema abierto con un modelo de voz ya cuantizado a 1.58-bit por su autor",
    verificado: false
  },
  {
    id: "vibeasr-cpp",
    nombre: "VibeASR.cpp (Microsoft)",
    repo: "https://github.com/microsoft/VibeASR.cpp",
    licencia: "MIT",
    arquitectura: "runtime C++/GGML con kernels SIMD (AVX2, NEON) para VibeVoice-ASR-BitNet; CPU en tiempo real (RTF 0,52 en M4)",
    idiomas: "inglés, francés, italiano, coreano, portugués, vietnamita, chino (español por probar)",
    estado: "en-uso",
    queTomamos: "el binario asr_infer y los GGUF I8_S/I2_S como motor de reconocimiento local del demonio de voz",
    motivo: "1,58 GB, sin GPU, misma familia GGML que omnivoice.cpp y BitNet",
    verificado: false
  },
  {
    id: "voicebox",
    nombre: "Voicebox (jamiepine)",
    repo: "https://github.com/jamiepine/voicebox",
    licencia: "MIT",
    arquitectura: "estudio de voz de escritorio (Tauri + FastAPI + React): 7 motores de clonación, Whisper, cola asíncrona, historial con versiones, cadena de efectos, editor multipista, API REST 17493 y MCP",
    idiomas: "según motor",
    estado: "candidato",
    queTomamos: "los patrones del estudio: cola de generación con estado en vivo, historial de tomas con linaje, cadena de efectos con presets y perfiles con varias muestras; y su API como motor externo opcional",
    motivo: "MIT y el estudio más completo en abierto",
    verificado: false
  }
];

export interface FaseForja {
  id: 1 | 2 | 3 | 4;
  nombre: string;
  descripcion: string;
  hitos: Array<{
    id: string;
    titulo: string;
    estado: "hecho" | "en-curso" | "pendiente" | "bloqueado-por-hardware";
  }>;
}

export const FASES_FORJA: FaseForja[] = [
  {
    id: 1,
    nombre: "programa único",
    descripcion: "fusionar con criterio el código de varios modelos abiertos en UN programa de voz propio (motor de inferencia GGUF/ternario + frontend de texto en español + condicionamiento por personalidad), con OmniVoice como voz base hoy y Orpheus+BitNet como camino al modelo acústico 1.58-bit",
    hitos: [
      {
        id: "demonio-omnivoice",
        titulo: "demonio local 127.0.0.1:4444 con omnivoice.cpp",
        estado: "hecho"
      },
      {
        id: "motor-unico-os",
        titulo: "motor único `hablarStarSeed` con niveles estudio/alta/ligera/minima",
        estado: "hecho"
      },
      {
        id: "frontend-espanol",
        titulo: "normalización y fonemización en español propia",
        estado: "pendiente"
      },
      {
        id: "acustico-ternario",
        titulo: "QAT 1.58-bit de un LM de tokens de audio tipo Orpheus con la receta de BitNet",
        estado: "bloqueado-por-hardware"
      },
      {
        id: "asr-ternario",
        titulo: "reconocimiento de voz 1.58-bit con VibeASR.cpp en el demonio",
        estado: "en-curso"
      }
    ]
  },
  {
    id: 2,
    nombre: "variaciones por personalidad",
    descripcion: "cada personalidad de Astraura con su variación (instruct, semilla, timbre, prosodia, etiquetas de emoción) sobre el mismo modelo",
    hitos: [
      {
        id: "instruct-por-personalidad",
        titulo: "instruct + semilla por timbre en el demonio",
        estado: "hecho"
      },
      {
        id: "variaciones-catalogo",
        titulo: "catálogo memory/voces-catalogo.md",
        estado: "en-curso"
      },
      {
        id: "emociones-etiquetas",
        titulo: "etiquetas de emoción para las variaciones",
        estado: "pendiente"
      }
    ]
  },
  {
    id: 3,
    nombre: "ajustes de personalización",
    descripcion: "controles para configurar cada voz (velocidad, tono, intensidad/exageración, calidez, respiración, etiquetas no verbales) guardados como versiones",
    hitos: [
      {
        id: "ajustes-velocidad-tono",
        titulo: "Ajustes del estudio",
        estado: "hecho"
      },
      {
        id: "intensidad-exageracion",
        titulo: "control continuo de 'exageración/intensidad' como ajuste de personalización por voz",
        estado: "pendiente"
      },
      {
        id: "versiones-guardadas",
        titulo: "Versiones del estudio",
        estado: "hecho"
      },
      {
        id: "efectos-y-tomas",
        titulo: "cola de generación, historial de tomas y cadena de efectos al estilo Voicebox",
        estado: "pendiente"
      }
    ]
  },
  {
    id: 4,
    nombre: "editor de voces",
    descripcion: "crear voces nuevas (clonación con poco audio, conversión de timbre, fusión) sobre el modelo base 1.58 de Astraura local, cuando ese modelo esté desarrollado a detalle",
    hitos: [
      {
        id: "clonacion-poco-audio",
        titulo: "flujo de clonación con poco audio para el editor de voces",
        estado: "hecho"
      },
      {
        id: "conversion-timbre",
        titulo: "conversor de timbre como capa de 'variación por personalidad' sin reentrenar el modelo acústico",
        estado: "pendiente"
      },
      {
        id: "fusion-de-voces",
        titulo: "pestaña Fusión",
        estado: "hecho"
      },
      {
        id: "editor-completo",
        titulo: "editor completo de voces",
        estado: "bloqueado-por-hardware"
      }
    ]
  }
];

export interface ModuloPrograma {
  id: string;
  nombre: string;
  origen: string[];
  estado: "en-uso" | "en-desarrollo" | "planeado";
  descripcion: string;
}

export const MODULOS_PROGRAMA: ModuloPrograma[] = [
  {
    id: "frontend-texto",
    nombre: "frontend-texto",
    origen: ["omnivoice"],
    estado: "en-uso",
    descripcion: "normalización y fonemización en español propia"
  },
  {
    id: "condicionamiento-personalidad",
    nombre: "condicionamiento-personalidad",
    origen: ["omnivoice", "chatterbox", "dia"],
    estado: "en-desarrollo",
    descripcion: "instruct + semilla por timbre en el demonio, etiquetas de emoción para las variaciones"
  },
  {
    id: "modelo-acustico",
    nombre: "modelo-acustico",
    origen: ["orpheus", "bitnet", "cosyvoice"],
    estado: "planeado",
    descripcion: "LM de tokens de audio tipo Orpheus cuantizado a ternario con la receta de BitNet"
  },
  {
    id: "codec-vocoder",
    nombre: "codec-vocoder",
    origen: ["omnivoice", "cosyvoice"],
    estado: "en-uso",
    descripcion: "GGUF vía omnivoice.cpp (Q8_0/Q4_K_M), HiFT vocoder"
  },
  {
    id: "servidor-local",
    nombre: "servidor-local",
    origen: ["omnivoice"],
    estado: "en-uso",
    descripcion: "native/astraura-voice/daemon.mjs"
  },
  {
    id: "cache-y-cola",
    nombre: "cache-y-cola",
    origen: ["omnivoice"],
    estado: "en-uso",
    descripcion: "motor-local.ts"
  },
  {
    id: "puente-os",
    nombre: "puente-os",
    origen: ["kokoro"],
    estado: "en-uso",
    descripcion: "voz-starseed/motor.ts"
  },
  {
    id: "conversor-timbre",
    nombre: "conversor-timbre",
    origen: ["openvoice"],
    estado: "planeado",
    descripcion: "conversión de timbre sobre una voz base (tone color converter)"
  },
  {
    id: "clonacion",
    nombre: "clonacion",
    origen: ["gpt-sovits"],
    estado: "planeado",
    descripcion: "clonación con 1 min de audio, VITS + GPT"
  },
  {
    id: "reconocimiento-voz",
    nombre: "reconocimiento-voz",
    origen: ["vibeasr-cpp", "vibevoice"],
    estado: "en-desarrollo",
    descripcion: "oído del programa: VibeASR.cpp ternario en el demonio, con Whisper en navegador como respaldo"
  },
  {
    id: "efectos-y-tomas",
    nombre: "efectos-y-tomas",
    origen: ["voicebox"],
    estado: "planeado",
    descripcion: "cola de generación, historial de tomas y cadena de efectos al estilo Voicebox"
  }
];

export const progresoFase = (f: FaseForja): number => {
  const totalHitos = f.hitos.length;
  const hitosHechos = f.hitos.filter(hito => hito.estado === "hecho").length;
  return Math.round((hitosHechos / totalHitos) * 100);
};

export const progresoForja = (): number => {
  const totalFases = FASES_FORJA.length;
  const progresoTotal = FASES_FORJA.reduce((sum, fase) => sum + progresoFase(fase), 0);
  return Math.round(progresoTotal / totalFases);
};

export const modelosPorEstado = (estado: ModeloFuente["estado"]): ModeloFuente[] => {
  return MODELOS_FUENTE.filter(modelo => modelo.estado === estado);
};

export const modelosUsablesEnProducto = (): ModeloFuente[] => {
  return MODELOS_FUENTE.filter(modelo => {
    const licenciaNoComercial = modelo.licencia.includes("NC") || (modelo.licenciaPesos && modelo.licenciaPesos.includes("NC"));
    return modelo.estado !== "descartado-para-producto" && !licenciaNoComercial;
  });
};