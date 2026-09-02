"use client";

/**
 * CATÁLOGO DE VOCES DE STARSEED (Adenda 218 · 2026-09-02)
 * ─────────────────────────────────────────────────────────────────────────────
 * Dos catálogos en uno, porque son dos cosas distintas y se confunden:
 *
 *  A · MOTORES — los sistemas que SINTETIZAN voz. Cada uno con su repositorio,
 *      su formato, qué hardware necesita y para qué tipo de descarga del OS es
 *      el adecuado. La Biblioteca los muestra en la categoría «Voces» con el
 *      enlace al repositorio y la versión instalada frente a la publicada.
 *
 *  B · REFERENCIAS — fuentes públicas de AUDIO HUMANO para clonar, afinar o
 *      entrenar voces: datasets, archivos y bibliotecas de efectos. Con su
 *      licencia, porque una voz clonada de un audio sin permiso es un problema
 *      real, no una nota al pie.
 *
 * NOMBRE: el motor nativo de Astraura —la fusión adaptada que estamos
 * desarrollando sobre OmniVoice/llama.cpp con clonación, instrucción de estilo,
 * entonación por contexto y anticipación— pasa a llamarse **VoiceMorphic**.
 * «OpenVoice» queda solo como nombre del proyecto externo del que partió una
 * de las vías.
 */

export type Plataforma = "macos" | "windows" | "linux" | "android" | "ios" | "web";

export interface MotorVozCatalogo {
    id: string;
    nombre: string;
    /** Frase honesta de qué es (propio / adaptado / externo). */
    origen: string;
    repo: string;
    /** Repositorio del que se leen versiones/releases (GitHub `owner/repo`). */
    releasesDe?: string;
    formato: string;
    /** RAM mínima razonable en GB para que funcione con dignidad. */
    ramMinGB: number;
    gpu: "no" | "opcional" | "necesaria";
    offline: boolean;
    plataformas: Plataforma[];
    /** Para qué descarga del OS es el motor por defecto. */
    porDefectoEn: Plataforma[];
    /** Cómo de rápido respecto a tiempo real en un equipo modesto. */
    velocidad: string;
    calidad: "alta" | "media" | "basica";
    notas: string;
}

export const MOTORES_VOZ: MotorVozCatalogo[] = [
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
        notas: "Solo cubre el hueco hasta que se instala un motor local.",
    },
];

/** Motor por defecto para una plataforma y su RAM. Honesto con el hardware. */
export function motorRecomendado(plataforma: Plataforma, ramGB: number): MotorVozCatalogo {
    const candidatos = MOTORES_VOZ.filter((m) => m.plataformas.includes(plataforma) && m.offline && m.ramMinGB <= ramGB);
    const porDefecto = candidatos.find((m) => m.porDefectoEn.includes(plataforma));
    return porDefecto ?? candidatos.sort((a, b) => a.ramMinGB - b.ramMinGB)[0] ?? MOTORES_VOZ[MOTORES_VOZ.length - 1];
}

/* ── B · Referencias de voz humana ─────────────────────────────────────────── */

export interface FuenteReferencia {
    nombre: string;
    url: string;
    tipo: "dataset" | "archivo público" | "efectos" | "corpus emocional" | "lista";
    licencia: string;
    comercial: "sí" | "no" | "según pista" | "verificar";
    idiomas: string;
    tamano: string;
    mejorPara: string;
}

/**
 * Fuentes verificadas en la investigación de la Adenda 218 (búsquedas web +
 * enjambre gratuito). Donde la licencia no se pudo confirmar, se dice.
 */
export const FUENTES_REFERENCIA: FuenteReferencia[] = [
    { nombre: "Mozilla Common Voice", url: "https://commonvoice.mozilla.org/datasets", tipo: "dataset", licencia: "CC0", comercial: "sí", idiomas: "130+ (español con miles de horas y acentos de muchos países)", tamano: ">13 000 h en total", mejorPara: "Diversidad de acentos y voces reales; afinado y entrenamiento. Calidad de micrófono variable." },
    { nombre: "Emilia", url: "https://huggingface.co/datasets/amphion/Emilia-Dataset", tipo: "dataset", licencia: "CC BY-NC 4.0", comercial: "no", idiomas: "en, zh, de, fr, ja, ko (español limitado)", tamano: "~100 000 h (habla espontánea de la web)", mejorPara: "Naturalidad conversacional y prosodia real; solo investigación." },
    { nombre: "LibriVox / LibriSpeech / LibriTTS", url: "https://librivox.org", tipo: "archivo público", licencia: "Dominio público (LibriVox); CC BY 4.0 (LibriSpeech/LibriTTS)", comercial: "sí", idiomas: "inglés sobre todo; hay español", tamano: "miles de horas de audiolibros", mejorPara: "Narración limpia y larga; clonación de voz narrativa." },
    { nombre: "Multilingual LibriSpeech (MLS)", url: "https://www.openslr.org/94/", tipo: "dataset", licencia: "CC BY 4.0", comercial: "sí", idiomas: "8 idiomas incl. español (~900 h)", tamano: "~50 000 h", mejorPara: "Español narrativo con licencia libre: primera opción para entrenar." },
    { nombre: "VCTK", url: "https://datashare.ed.ac.uk/handle/10283/3443", tipo: "dataset", licencia: "CC BY 4.0", comercial: "sí", idiomas: "inglés (110 hablantes, acentos)", tamano: "~44 h", mejorPara: "Multi-hablante limpio; referencias de timbre variadas." },
    { nombre: "CSS10", url: "https://github.com/Kyubyong/css10", tipo: "dataset", licencia: "CC0 (audiolibros de LibriVox)", comercial: "sí", idiomas: "10 idiomas incl. español", tamano: "~24 h en español (una voz)", mejorPara: "Una voz española limpia y larga para afinar un timbre concreto." },
    { nombre: "CIEMPIESS (UNAM)", url: "https://ciempiess.org", tipo: "dataset", licencia: "CC BY-SA 4.0", comercial: "verificar", idiomas: "español de México (radio)", tamano: "decenas de horas", mejorPara: "Acento mexicano, habla de radio y entrevista." },
    { nombre: "TEDx Spanish Corpus", url: "https://www.openslr.org/67/", tipo: "dataset", licencia: "CC BY-NC-ND 4.0", comercial: "no", idiomas: "español (charlas)", tamano: "~24 h", mejorPara: "Oratoria y expresividad en español; solo investigación." },
    { nombre: "Expresso (Meta)", url: "https://speechbot.github.io/expresso/", tipo: "corpus emocional", licencia: "CC BY-NC 4.0", comercial: "no", idiomas: "inglés", tamano: "~40 h con estilos (susurro, risa, enfado…)", mejorPara: "Estilos y emociones muy marcados como referencia de expresividad." },
    { nombre: "EmoV-DB", url: "https://www.openslr.org/115/", tipo: "corpus emocional", licencia: "verificar (OpenSLR)", comercial: "verificar", idiomas: "inglés, francés", tamano: "~7 000 frases, 5 emociones", mejorPara: "Emociones etiquetadas para afinar la instrucción de estilo." },
    { nombre: "RAVDESS", url: "https://zenodo.org/records/1188976", tipo: "corpus emocional", licencia: "CC BY-NC-SA 4.0", comercial: "no", idiomas: "inglés (24 actores)", tamano: "7 356 archivos, 8 emociones", mejorPara: "Actuación emocional controlada; investigación." },
    { nombre: "CREMA-D", url: "https://github.com/CheyneyComputerScience/CREMA-D", tipo: "corpus emocional", licencia: "Open Database License (ODbL)", comercial: "verificar", idiomas: "inglés (91 actores)", tamano: "7 442 clips, 6 emociones", mejorPara: "Diversidad de edades y etnias en emociones." },
    { nombre: "MSP-Podcast", url: "https://ecs.utdallas.edu/research/researchlabs/msp-lab/MSP-Podcast.html", tipo: "corpus emocional", licencia: "Académica (acuerdo)", comercial: "no", idiomas: "inglés (podcasts)", tamano: "~230 h", mejorPara: "Emoción natural, no actuada; requiere solicitud." },
    { nombre: "BBC Sound Effects", url: "https://sound-effects.bbcrewind.co.uk", tipo: "efectos", licencia: "RemArc (uso personal/educativo/investigación; comercial bajo licencia)", comercial: "no", idiomas: "—", tamano: "33 000 efectos", mejorPara: "Ambientes y efectos para escenas; no para clonar voz." },
    { nombre: "Freesound", url: "https://freesound.org", tipo: "efectos", licencia: "CC0 / CC BY / CC BY-NC por pista", comercial: "según pista", idiomas: "muchos", tamano: "cientos de miles de sonidos", mejorPara: "Efectos vocales, gritos, risas, susurros; filtrar por CC0." },
    { nombre: "Internet Archive · audio", url: "https://archive.org/details/audio", tipo: "archivo público", licencia: "Variable: dominio público y CC; comprobar por ítem", comercial: "según pista", idiomas: "muchos", tamano: "millones de grabaciones", mejorPara: "Radio antigua, teatro, discursos, doblajes históricos de dominio público." },
    { nombre: "Wikimedia Commons · Sound", url: "https://commons.wikimedia.org/wiki/Commons:Free_media_resources/Sound", tipo: "lista", licencia: "Libre (índice de recursos)", comercial: "según pista", idiomas: "muchos", tamano: "índice", mejorPara: "Punto de partida para localizar audio libre por tema." },
    { nombre: "VoxCeleb", url: "https://www.robots.ox.ac.uk/~vgg/data/voxceleb/", tipo: "dataset", licencia: "CC BY 4.0 (metadatos); audio de YouTube", comercial: "verificar", idiomas: "muchos (celebridades)", tamano: ">2 000 h", mejorPara: "Diversidad de timbres para identificación; NO para clonar personas reales sin permiso." },
    { nombre: "GigaSpeech / People's Speech", url: "https://github.com/SpeechColab/GigaSpeech", tipo: "dataset", licencia: "Apache-2.0 (GigaSpeech); CC BY-SA (People's Speech)", comercial: "sí", idiomas: "inglés", tamano: "10 000 h / 30 000 h", mejorPara: "Habla espontánea a gran escala; entrenamiento." },
    { nombre: "Hi-Fi TTS", url: "https://www.openslr.org/109/", tipo: "dataset", licencia: "CC BY 4.0", comercial: "sí", idiomas: "inglés (10 hablantes)", tamano: "~290 h a 44,1 kHz", mejorPara: "Alta fidelidad para afinar calidad de audio." },
    { nombre: "voice_datasets (índice)", url: "https://github.com/jim-schwoebel/voice_datasets", tipo: "lista", licencia: "índice", comercial: "según pista", idiomas: "muchos", tamano: "95+ datasets", mejorPara: "Índice mantenido para descubrir más fuentes." },
];

/** Las que conviene usar PRIMERO para voces en español con licencia libre. */
export const PRIORIDAD_ESPANOL = ["Multilingual LibriSpeech (MLS)", "Mozilla Common Voice", "CSS10", "LibriVox / LibriSpeech / LibriTTS", "CIEMPIESS (UNAM)"];
