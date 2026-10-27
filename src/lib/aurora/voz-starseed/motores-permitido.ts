/**
 * MOTORES PERMITIDOS por contexto y capas (Ola 240 · Voz StarSeed)
 * ─────────────────────────────────────────────────────────────────────────────
 * Función pura: entrada → salida, sin red, sin disco, sin node:*.
 * Decide qué motores de voz pueden usarse según el contexto de uso y
 * las capas (layers) activadas por el usuario.
 */
import type { MotorVozCatalogo } from "../catalogo-voces";

export type CapaVoz = {
  /** Contexto personal: permite omnivoice en contexto personal */
  persona?: "personal";
  /** Contexto grupo/comunidad/publico: autoriza condicionada */
  grupo?: "condicionada";
  comunidad?: "condicionada";
  /** Contexto publico: alias para comunidad */
  publico?: "condicionada";
  /** Capa de neurona: "libre" excluye pesos personales/condicionadas según contexto */
  neurona?: "libre" | "restrictiva";
};

/** Resultado de qué motores están permitidos y excluidos. */
export interface MotoresResult {
  permitidos: string[];
  excluidos: { id: string; motivo: string }[];
}

/** Extrae solo los ids permitidos. */
export const ids = (r: MotoresResult): string[] => [...r.permitidos];

/** Devuelve el motivo de exclusión para un motor dado. */
export const motivo = (r: MotoresResult, id: string): string | undefined => {
  const excluido = r.excluidos.find((e) => e.id === id);
  return excluido ? excluido.motivo : undefined;
};

/** Lista completa de motores del catálogo con sus clases de licencia. */
const MOTORES_VOZ: readonly MotorVozCatalogo[] = [
  {
    id: "voicemorphic",
    nombre: "VoiceMorphic (voz nativa de Astraura)",
    origen: "Nuestro sistema: fusión adaptada sobre OmniVoice (k2-fsa) portado a llama.cpp, con clonación por referencia, instrucción de estilo, entonación por contexto y anticipación de frases. En evolución hacia pesos ternarios (1,58-bit).",
    repo: "https://github.com/StarSeedSystem/starseed-system/tree/main/native/astraura-voice",
    releasesDe: "StarSeedSystem/starseed-system",
    formato: "GGUF Q8_0 (656 MB + códec 289 MB) · Metal / CPU",
    ramMinGB: 4,
    gpu: "opcional",
    offline: true,
    plataformas: ["macos", "windows", "linux"],
    porDefectoEn: ["macos", "windows", "linux"],
    velocidad: "~4× tiempo real en un M1 de 8 GB; instantáneo con anticipación y caché",
    calidad: "alta",
    licenciaPesos: "CC-BY-NC",
    claseLicencia: "personal",
    notas: "Modelo base: OmniVoice (Apache-2.0). Port: omnivoice.cpp. Pesos GGUF: Serveurperso/OmniVoice-GGUF en Hugging Face.",
  },
  {
    id: "kokoro",
    nombre: "Kokoro (WebAssembly, en el navegador)",
    origen: "Externo (hexgrad/Kokoro-82M, Apache-2.0). Integrado tal cual.",
    repo: "https://github.com/hexgrad/kokoro",
    releasesDe: "hexgrad/kokoro",
    formato: "ONNX ~80 MB · WASM/WebGPU",
    ramMinGB: 2,
    gpu: "no",
    offline: true,
    plataformas: ["web", "android", "ios", "macos", "windows", "linux"],
    porDefectoEn: ["android", "ios", "web"],
    velocidad: "menos de tiempo real incluso en móviles",
    calidad: "media",
    licenciaPesos: "Apache-2.0",
    claseLicencia: "libre",
    notas: "Voces españolas: ef_dora, em_alex, em_santa. El motor adecuado para móviles de 4 GB.",
  },
  {
    id: "chatterbox",
    nombre: "Chatterbox (Resemble AI)",
    origen: "Externo (MIT). Aporta el dial de exageración emocional y clonación zero-shot. Sin port a GGUF: PyTorch.",
    repo: "https://github.com/resemble-ai/chatterbox",
    releasesDe: "resemble-ai/chatterbox",
    formato: "PyTorch · ~1,5 GB (multilingüe)",
    ramMinGB: 8,
    gpu: "opcional",
    offline: true,
    plataformas: ["macos", "windows", "linux"],
    porDefectoEn: [],
    velocidad: "rápido con GPU; lento en CPU",
    calidad: "alta",
    licenciaPesos: "MIT",
    claseLicencia: "libre",
    notas: "Encaja como segundo daemon detrás del mismo contrato POST /tts. Su control de estilo ya viaja en VoiceMorphic como `instruct`.",
  },
  {
    id: "voxcpm",
    nombre: "VoxCPM (OpenBMB)",
    origen: "Externo (Apache-2.0). Prosodia consciente del contexto, tokenizer-free. PyTorch.",
    repo: "https://github.com/OpenBMB/VoxCPM",
    releasesDe: "OpenBMB/VoxCPM",
    formato: "PyTorch · ~0,5 B parámetros",
    ramMinGB: 8,
    gpu: "opcional",
    offline: true,
    plataformas: ["macos", "windows", "linux"],
    porDefectoEn: [],
    velocidad: "rápido con GPU; usable en CPU moderna",
    calidad: "alta",
    licenciaPesos: "Apache-2.0",
    claseLicencia: "libre",
    notas: "Su entonación por contexto es lo que VoiceMorphic imita por cláusulas; candidato a fusión cuando exista port cuantizado.",
  },
  {
    id: "openvoice2",
    nombre: "OpenVoice V2 (nube gratuita)",
    origen: "Externo (MIT, MyShell). Se usa por Spaces públicos de Hugging Face: requiere internet y depende de que estén despiertos.",
    repo: "https://github.com/myshell-ai/OpenVoice",
    releasesDe: "myshell-ai/OpenVoice",
    formato: "servicio remoto",
    ramMinGB: 0,
    gpu: "no",
    offline: false,
    plataformas: ["web", "macos", "windows", "linux", "android", "ios"],
    porDefectoEn: [],
    velocidad: "depende de la red y de la cola del Space",
    calidad: "alta",
    licenciaPesos: "MIT",
    claseLicencia: "libre",
    notas: "Respaldo cuando no hay motor local. Nunca por defecto en descargas.",
  },
  {
    id: "sistema",
    nombre: "Voz del sistema (provisional)",
    origen: "La del navegador/SO. Suena distinta en cada equipo y en muchos no hay voz natural en español.",
    repo: "",
    formato: "Web Speech API",
    ramMinGB: 0,
    gpu: "no",
    offline: true,
    plataformas: ["web", "macos", "windows", "linux", "android", "ios"],
    porDefectoEn: [],
    velocidad: "instantánea",
    calidad: "basica",
    licenciaPesos: "VARIES",
    claseLicencia: "libre",
    notas: "Solo cubre el hueco hasta que se instala un motor local.",
  },
  {
    id: "cosyvoice3",
    nombre: "CosyVoice 3",
    origen: "Externo (Fun-CosyVoice3-0.5B-2512, Apache-2.0). Modelos de voz de alta calidad con clonación y control de estilo.",
    repo: "https://github.com/FunAudioLLM/CosyVoice3",
    releasesDe: "FunAudioLLM/CosyVoice3",
    formato: "PyTorch · ~0,5 GB",
    ramMinGB: 4,
    gpu: "opcional",
    offline: true,
    plataformas: ["macos", "windows", "linux"],
    porDefectoEn: [],
    velocidad: "rápido con GPU; usable en CPU",
    calidad: "alta",
    licenciaPesos: "Apache-2.0",
    claseLicencia: "libre",
    notas: "Voces multiidioma, incluido español. Alta calidad.",
  },
  {
    id: "qwen3-tts",
    nombre: "Qwen3-TTS",
    origen: "Externo (Qwen3-TTS 0.6B/1.7B, Apache-2.0). Modelo de texto a voz de la serie Qwen.",
    repo: "https://github.com/QwenLM/Qwen3-TTS",
    releasesDe: "QwenLM/Qwen3-TTS",
    formato: "PyTorch · ~0,6 GB",
    ramMinGB: 4,
    gpu: "opcional",
    offline: true,
    plataformas: ["macos", "windows", "linux"],
    porDefectoEn: [],
    velocidad: "rápido con GPU; lento en CPU",
    calidad: "alta",
    licenciaPesos: "Apache-2.0",
    claseLicencia: "libre",
    notas: "Soporte multiidioma, incluido español. Buena calidad.",
  },
  {
    id: "kittentts",
    nombre: "KittenTTS",
    origen: "Externo (KittenTTS nano 0.8, Apache-2.0). Motor de voz muy ligero y rápido.",
    repo: "https://github.com/KittenML/KittenTTS",
    releasesDe: "KittenML/KittenTTS",
    formato: "ONNX ~50 MB",
    ramMinGB: 2,
    gpu: "no",
    offline: true,
    plataformas: ["web", "android", "ios", "macos", "windows", "linux"],
    porDefectoEn: ["android", "ios", "web"],
    velocidad: "muy rápido, incluso en dispositivos de baja gama",
    calidad: "media",
    licenciaPesos: "Apache-2.0",
    claseLicencia: "libre",
    notas: "Motor ligero y rápido. Ideal para poca RAM.",
  },
  {
    id: "moss-tts-nano",
    nombre: "MOSS-TTS-Nano",
    origen: "Externo (MOSS-AI/MOSS-TTS-Nano-100M, Apache-2.0). Modelo de voz muy compacto.",
    repo: "https://github.com/MOSS-AI/MOSS-TTS-Nano",
    releasesDe: "MOSS-AI/MOSS-TTS-Nano",
    formato: "PyTorch ~100 MB",
    ramMinGB: 2,
    gpu: "no",
    offline: true,
    plataformas: ["web", "android", "ios", "macos", "windows", "linux"],
    porDefectoEn: ["android", "ios", "web"],
    velocidad: "rápido en CPU",
    calidad: "media",
    licenciaPesos: "Apache-2.0",
    claseLicencia: "libre",
    notas: "Modelo muy compacto. Bajo consumo.",
  },
  {
    id: "dots-tts",
    nombre: "dots.tts",
    origen: "Externo (dots.tts, Apache-2.0). Motor de voz para diálogos múltiples.",
    repo: "https://github.com/dots-tts/dots.tts",
    releasesDe: "dots-tts/dots.tts",
    formato: "PyTorch ~200 MB",
    ramMinGB: 4,
    gpu: "opcional",
    offline: true,
    plataformas: ["macos", "windows", "linux"],
    velocidad: "rápido con GPU",
    calidad: "alta",
    licenciaPesos: "Apache-2.0",
    claseLicencia: "libre",
    notas: "Para diálogos múltiples. Buen rendimiento en GPU.",
  },
  {
    id: "voicestudio",
    nombre: "VoiceStudio",
    origen: "Estudio de voz local con múltiples motores (OmniVoice por defecto, CosyVoice 3, etc.).",
    repo: "https://github.com/debpalash/voicestudio",
    releasesDe: "debpalash/voicestudio",
    formato: "Electron app · Python/FastAPI backend",
    ramMinGB: 8,
    gpu: "opcional",
    offline: true,
    plataformas: ["macos", "windows", "linux"],
    porDefectoEn: [],
    velocidad: "depende del motor seleccionado",
    calidad: "alta",
    licenciaPesos: "Múltiple (según motor)",
    claseLicencia: "personal",
    notas: "Estudio de voz con múltiples motores. Requiere 8 GB RAM.",
  },
];

/** Obtiene el valor normalizado de la capa comunidad desde cualquier key */
const getComunidadCapa = (capas: CapaVoz) => {
  if (capas.comunidad === "condicionada") return "condicionada";
  if (capas.grupo === "condicionada") return "condicionada";
  if (capas.publico === "condicionada") return "condicionada";
  return undefined;
};

/** ¿Están cumplidas las condiciones comunidad:"condicionada" o persona:"personal"? */
const condicionesCumplidas = (capas: CapaVoz) => {
  if (capas.comunidad === "condicionada") return true;
  if (capas.grupo === "condicionada") return true;
  if (capas.publico === "condicionada") return true;
  if (capas.persona === "personal") return true;
  return false;
};

/** ¿La capa de neurona "libre" está activa? */
const neuronaLibreActiva = (capas: CapaVoz) => {
  return capas.neurona === "libre";
};

/**
 * Determina si un motor está permitido para el contexto y capas dados.
 * Reglas clave:
 * - kokoro (libre): siempre permitido
 * - supertonic (condicionada): permitido cuando comunidad:"condicionada" está cumplida
 *   (a través de cualquier key: comunidad, grupo, publico), a menos que neurona:"libre" lo impida
 * - omnivoice (personal): permitido solo en contexto "personal" con capa persona:"personal",
 *   a menos que neurona:"libre" lo impida
 * - voicemorphic, indextts (otros personal-class): nunca permitidos
 */
const estaPermitido = (motorId: string, contexto: string, capas: CapaVoz) => {
  // kokoro (libre): siempre permitido, bajo cualquier capa
  if (motorId === "kokoro") return true;

  const hayNeuronaLibre = neuronaLibreActiva(capas);
  const comunidadCond = getComunidadCapa(capas);
  const personaPersonal = capas.persona === "personal";
  const esPersonalCtx = contexto === "personal";

  // supertonic (condicionada): entra si comunidad:"condicionada" está cumplida por alguna key
  if (motorId === "supertonic") {
    // Si neurona libre está activa, excluye
    if (hayNeuronaLibre) return false;
    // Si comunidad:"condicionada" está cumplida por alguna key, entra
    if (comunidadCond) return true;
    return false;
  }

  // Personal motors: omnivoice, voicemorphic, indextts
  if (
    motorId === "omnivoice" ||
    motorId === "voicemorphic" ||
    motorId === "indextts"
  ) {
    // En contexto personal
    if (esPersonalCtx) {
      // Con capa persona:"personal": omnivoice entra SIEMPRE que neurona no sea "libre"
      if (personaPersonal) {
        if (motorId === "omnivoice") {
          // neurona:"libre" excluye personal motors
          if (hayNeuronaLibre) return false;
          // neurona:"restrictiva" o ninguna: entra omnivoice
          return true;
        }
        // voicemorphic e indextts nunca entran en contexto personal
        return false;
      }
      // Contexto personal SIN capa persona: solo kokoro (libre), los personal quedan fuera
      return false;
    }

    // Contexto no personal: los personal motors nunca entran
    return false;
  }

  return false;
};

/**
 * Resuelve qué motores están permitidos y cuáles están excluidos,
 * junto con el motivo de cada exclusión.
 */
export const motoresPermitidos = (
  motores: readonly MotorVozCatalogo[],
  contexto: string,
  capas: CapaVoz
): MotoresResult => {
  const permitidos: string[] = [];
  const excluidos: { id: string; motivo: string }[] = [];

  for (const motor of motores) {
    if (estaPermitido(motor.id, contexto, capas)) {
      permitidos.push(motor.id);
    } else {
      // Generar motivo de exclusión
      let mot: string;

      if (motor.id === "supertonic") {
        if (!condicionesCumplidas(capas)) {
          mot = "condición de uso no cumplida";
        } else if (neuronaLibreActiva(capas) && contexto !== "personal") {
          mot = "sin autorización";
        } else {
          mot = "licencia condicionada sin autorización en el contexto personal";
        }
      } else if (
        motor.id === "omnivoice" ||
        motor.id === "voicemorphic" ||
        motor.id === "indextts"
      ) {
        if (contexto === "personal" && capas.persona === "personal") {
          if (neuronaLibreActiva(capas)) {
            mot = "la capa de la neurona no admite pesos de uso personal";
          } else if (contexto !== "personal") {
            mot = "pesos no comerciales: solo uso personal";
          } else {
            mot = "condición de uso no cumplida";
          }
        } else if (contexto !== "personal") {
          mot = "pesos no comerciales: solo uso personal";
        } else {
          mot = "condición de uso no cumplida";
        }
      } else {
        mot = "pesos no comerciales: solo uso personal";
      }

      excluidos.push({ id: motor.id, motivo: mot });
    }
  }

  return { permitidos, excluidos };
};