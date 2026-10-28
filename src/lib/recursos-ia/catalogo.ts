/**
 * Catálogo unificado de modelos de IA locales para «Recursos de IA» (SOP `architecture/recursos-ia-neurona.md`).
 * PURO (lo importa el cliente): nada de `node:*`, sin red ni disco.
 *
 * Tres fuentes, en este orden de precedencia (si un id se repite, gana la primera):
 *   1. Capas de Astraura (`config/capas-astraura.json`): las únicas con SHA y tamaño medido.
 *   2. `MODELOS_EXTRA`: lo que entra por la Biblioteca y no es una capa (TurboFieldfare).
 *   3. Especificaciones locales de `src/ai/astraura/model-requirements.ts` (+ Supertonic 3).
 *
 * CONVENCIÓN `ramMinGb` (todo el catálogo): RAM TOTAL mínima del equipo que procesa, no la que
 * ocupa el modelo. Es lo que se compara con `Procesador.ramGb`; lo que el modelo ocupa de verdad
 * va en `notas` cuando se sabe (TurboFieldfare: ~2 GB en un equipo de 8 GB).
 *
 * CONVENCIÓN `disco.gb`: GB decimales (10^9 bytes) redondeados hacia arriba. Frente a un espacio
 * libre medido en GiB el número del modelo sale algo mayor: si se equivoca, es por prudencia.
 * `gb: null` = desconocido o depende de la variante: hay que PREGUNTAR (regla de Alex).
 */
import capasJson from "../../../config/capas-astraura.json";
import { LOCAL_LLM_SPECS, LOCAL_VOICE_SPECS, type ModelSpec } from "@/ai/astraura/model-requirements";
import { MODELOS_IMAGEN, type ModeloImagen } from "@/lib/imagenes/modelos";
import type { Acelerador, Arquitectura, Bits, Capacidad, MedioApp, RequisitosModelo } from "./tipos";

/* ───────────────────────────── Bits ───────────────────────────── */

const BITS_VALIDOS: readonly Bits[] = [1, 1.58, 2, 3, 4, 5, 6, 8, 16, 32];

/**
 * Bits declarados en un texto (id, familia, archivo…) o null si no dice nada.
 * El orden importa: lo ternario antes que «2 bits» (Bonsai ternario se empaqueta en Q2_0) y
 * las cuantizaciones Q antes que «f16» («q4f16» es 4-bit con activaciones en f16).
 */
function bitsExplicitos(texto: string): Bits | null {
    const t = texto.toLowerCase();
    if (/ternar|bitnet|1[._]58|(^|[^0-9.])158(?![0-9])|i2_s|tq[12]_0|\btl[12]\b|q2_0/.test(t)) return 1.58;
    if (/(^|[^0-9.])1[-_ ]?bit|q1_0/.test(t)) return 1;
    if (/q8|int8|(^|[^0-9.])8[-_ ]?bit/.test(t)) return 8;
    if (/q6/.test(t)) return 6;
    if (/q5/.test(t)) return 5;
    if (/q4|int4|nf4|awq|gptq|(^|[^0-9.])4[-_ ]?bit/.test(t)) return 4;
    if (/q3/.test(t)) return 3;
    if (/q2|cq2|(^|[^0-9.])2[-_ ]?bit/.test(t)) return 2;
    if (/bf16|fp16|f16/.test(t)) return 16;
    if (/fp32|f32/.test(t)) return 32;
    return null;
}

/** Bits de los pesos deducidos de familia/modelo/runtime/formato/id (ternario → 1.58). */
export function bitsDeModelo(texto: { id?: string; familia?: string; modelo?: string; runtime?: string; formato?: string }): Bits {
    const junto = [texto.id, texto.familia, texto.modelo, texto.runtime, texto.formato].filter(Boolean).join(" ");
    const explicitos = bitsExplicitos(junto);
    if (explicitos !== null) return explicitos;
    // Needle 3 (.cact) es CQ2 a ~2,1 bits/peso; el resto del ecosistema local va en 4-bit por defecto.
    if ((texto.formato ?? "").toLowerCase() === "cact") return 2;
    return 4;
}

/** Bits a partir del tamaño real y los parámetros, ajustados al valor más cercano del contrato. */
function bitsPorTamano(bytes: number, parametrosB: number): Bits | null {
    if (!(bytes > 0) || !(parametrosB > 0)) return null;
    const bpp = (bytes * 8) / (parametrosB * 1e9);
    let mejor: Bits = 4;
    let distancia = Infinity;
    for (const b of BITS_VALIDOS) {
        const d = Math.abs(b - bpp);
        if (d < distancia) {
            mejor = b;
            distancia = d;
        }
    }
    return mejor;
}

/* ───────────────────────────── Utilidades ───────────────────────────── */

const MEDIOS_VALIDOS: readonly MedioApp[] = ["web", "pwa", "nativo", "servidor"];

const arribaCent = (x: number): number => Math.ceil(x * 100 - 1e-9) / 100;
const esTexto = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const esPositivo = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** «121 M» → 0.121 · «0.6 B» → 0.6 · «voz» → 0 (sin publicar). */
function parametrosEnB(texto: unknown): number {
    if (typeof texto === "number") return texto > 0 ? texto : 0;
    if (!esTexto(texto)) return 0;
    const m = /([0-9]+(?:[.,][0-9]+)?)\s*([mbk])?/i.exec(texto);
    if (!m) return 0;
    const n = Number(m[1].replace(",", "."));
    const unidad = (m[2] ?? "b").toLowerCase();
    if (unidad === "m") return n / 1000;
    if (unidad === "k") return n / 1e6;
    return n;
}

/* ───────────────────────────── 1. Capas de Astraura ───────────────────────────── */

/** Papel de la capa → qué sabe hacer (tabla §3 de `architecture/capas-autoadaptables.md`). */
function capacidadesDeCapa(capa: string, runtime: string): Capacidad[] {
    switch (capa) {
        case "reflejo":
            // Needle 3 también da embeddings: §3 lo pone de último recurso de la memoria.
            return ["decision", "embeddings"];
        case "juicio":
            // Colibri: el juicio decide sí/no entre opciones (Laya, GLiNER-Decide, Clef).
            return ["decision"];
        case "memoria":
            return ["embeddings"];
        case "palabra":
            return ["texto"];
        case "razon":
        case "profunda":
            return ["razon", "texto"];
        case "voz":
        case "oído":
        case "oido":
            // En el catálogo de capas «voz» es dictado (VibeASR), y «oído» Phonon/Parakeet: todo es oír.
            return ["voz-asr"];
        case "adaptador":
            // Un adaptador afina a otro modelo: hereda su papel (Needle decide; LoRA de Bonsai habla).
            return runtime.includes("needle") ? ["decision"] : ["texto"];
        default:
            return [];
    }
}

/** Licencias que el repo ya documenta por familia (el JSON de capas no las lleva). */
const LICENCIA_POR_FAMILIA: [RegExp, string][] = [
    [/^cactus-compute\//i, "Apache-2.0"],
    [/^microsoft\//i, "MIT"],
    [/^prism-ml\//i, "Apache-2.0"],
    [/^onnx-community\/(ternary-)?bonsai/i, "Apache-2.0"],
    [/^fermionresearch\/phonon/i, "CC-BY-4.0 (pesos) · Apache-2.0 (código)"],
    [/^nvidia\/parakeet/i, "CC-BY-4.0"],
];

function licenciaDe(familia: string, declarada: unknown): string {
    if (esTexto(declarada)) return declarada;
    for (const [re, licencia] of LICENCIA_POR_FAMILIA) if (re.test(familia)) return licencia;
    return "por-verificar";
}

function estadoDeCapa(estado: unknown, shaValido: boolean): RequisitosModelo["estado"] | null {
    if (estado === "retirado") return null; // una capa retirada no se sugiere nunca
    // §6 de las capas: sin su SHA no se usa jamás → se enseña, pero en pruebas.
    if (!shaValido) return "en-pruebas";
    if (estado === "recomendado" || estado === "respaldo") return estado;
    return "en-pruebas"; // «en-banco» y cualquier valor desconocido
}

/** Convierte las capas de `config/capas-astraura.json` en requisitos del contrato. */
export function modelosDeCapas(json: unknown): RequisitosModelo[] {
    const raiz = (typeof json === "object" && json !== null ? json : {}) as { capas?: unknown };
    const capas = Array.isArray(raiz.capas) ? raiz.capas : [];
    const salida: RequisitosModelo[] = [];
    for (const cruda of capas) {
        if (typeof cruda !== "object" || cruda === null) continue;
        const c = cruda as Record<string, unknown>;
        if (!esTexto(c.id) || !esTexto(c.capa)) continue;
        const id = c.id.trim();
        const familia = esTexto(c.familia) ? c.familia : id;
        const modelo = esTexto(c.modelo) ? c.modelo : id;
        const runtime = esTexto(c.runtime) ? c.runtime : "desconocido";
        // «bps.tar.zst» es el empaquetado; el formato es «bps».
        const formato = esTexto(c.formato) ? c.formato.split(".")[0] : "desconocido";
        const capacidades = capacidadesDeCapa(c.capa, runtime);
        if (capacidades.length === 0) continue;

        const sha = esTexto(c.sha256) ? c.sha256.toLowerCase() : "";
        const shaValido = /^[0-9a-f]{64}$/.test(sha);
        const estado = estadoDeCapa(c.estado, shaValido);
        if (!estado) continue;

        // El tamaño sale del archivo real (`tamano_bytes`, suma de todos sus archivos) y, si no
        // hay, de `disco_mb`, que es una estimación vieja (VibeASR dice 500 MB y son 1,7 GB).
        const bytes = esPositivo(c.tamano_bytes) ? c.tamano_bytes : 0;
        const gb = bytes ? arribaCent(bytes / 1e9) : esPositivo(c.disco_mb) ? arribaCent(c.disco_mb / 1000) : null;
        // «Verificado» = medido del archivo real: hace falta el tamaño real y (fecha de
        // verificación o SHA de 64 hex) en el JSON.
        const verificado = bytes > 0 && (esTexto(c.verificado) || shaValido);

        const parametrosB = parametrosEnB(c.parametros);
        const archivo = esTexto(c.archivo) ? c.archivo : "";
        // Primero lo que dicen los nombres (también el del archivo: «…q8_0.gguf»); si no dicen
        // nada, el tamaño real frente a los parámetros (Phonon-2: ~2,2 bits); y si tampoco, el
        // valor por formato de `bitsDeModelo`.
        const explicitos = bitsExplicitos([id, familia, modelo, runtime, formato, archivo].join(" "));
        const porFormato = explicitos === null && formato === "cact" ? bitsDeModelo({ formato }) : null;
        const porTamano = explicitos === null && porFormato === null ? bitsPorTamano(bytes, parametrosB) : null;
        const bits = explicitos ?? porFormato ?? porTamano ?? bitsDeModelo({ id, familia, modelo, runtime, formato });

        const medios = Array.isArray(c.medios)
            ? c.medios.filter((m): m is MedioApp => MEDIOS_VALIDOS.includes(m as MedioApp))
            : [];

        const notas: string[] = [];
        if (!shaValido) notas.push("SHA por verificar: no se usa hasta que el renovador de capas lo rellene.");
        if (porTamano !== null) notas.push("Bits deducidos del tamaño real del archivo.");
        if (parametrosB === 0) notas.push("Parámetros sin publicar en el catálogo de capas.");
        if (Array.isArray(c.profundidades) && c.profundidades.length > 1) {
            notas.push("Profundidad variable (de 2 a 20 capas): el tamaño indicado es el de la más completa.");
        }

        const aceleradoresRequeridos: Acelerador[] | undefined = runtime === "webgpu-onnx" ? ["webgpu"] : undefined;
        // bitnet.cpp tiene núcleos para x86 (AVX2) y ARM (NEON); nada más.
        const arquitecturas: Arquitectura[] | undefined = runtime === "bitnet-cpp" ? ["arm64", "x86_64"] : undefined;
        const mapea = formato === "gguf"; // llama.cpp y bitnet.cpp hacen mmap de un GGUF

        const entrada: RequisitosModelo = {
            id,
            nombre: modelo,
            familia,
            capacidades,
            bits,
            formato,
            runtime,
            parametrosB,
            disco: { gb, verificado },
            ramMinGb: esPositivo(c.ram_min_mb) ? arribaCent(c.ram_min_mb / 1024) : 0,
            almacenamiento: { modo: mapea ? "mmap" : "carga-completa", soloLocal: runtime === "webgpu-onnx" },
            medios,
            licencia: licenciaDe(familia, c.licencia),
            upstream: esTexto(c.fuente_oficial) ? c.fuente_oficial : "",
            estado,
            origen: "capas",
        };
        if (aceleradoresRequeridos) entrada.aceleradoresRequeridos = aceleradoresRequeridos;
        if (arquitecturas) entrada.arquitecturas = arquitecturas;
        if (notas.length) entrada.notas = notas.join(" ");
        salida.push(entrada);
    }
    return salida;
}

/* ───────────────────────────── 2. Extras (Biblioteca) ───────────────────────────── */

/** Modelos que no vienen de las capas ni de las especificaciones locales (p. ej. TurboFieldfare). */
export const MODELOS_EXTRA: RequisitosModelo[] = [
    {
        // SOP §5. Runtime propio Swift + Metal 4: el núcleo y la caché KV en RAM, y del SSD solo
        // los expertos que pide cada token. Es lo más potente que cabe en un Apple Silicon de 8 GB.
        id: "turbo-fieldfare-gemma4-26b-a4b",
        nombre: "TurboFieldfare · Gemma 4 26B-A4B",
        familia: "google/gemma-4",
        capacidades: ["texto", "razon"],
        bits: 4,
        formato: "gturbo",
        runtime: "swift-metal",
        parametrosB: 26,
        activosB: 4,
        disco: { gb: 14.3, verificado: false, descargaGb: 15 },
        ramMinGb: 8,
        so: ["macOS>=26"],
        arquitecturas: ["arm64"],
        aceleradoresRequeridos: ["metal4"],
        herramientasRequeridas: ["swift-6.2", "xcode-26"],
        almacenamiento: { modo: "streaming-ssd", lecturaMinMBs: 800, soloLocal: true },
        servidor: { protocolo: "openai", url: "http://127.0.0.1:8080/v1" },
        medios: ["nativo", "servidor"],
        licencia: "Apache-2.0",
        upstream: "https://github.com/drumih/turbo-fieldfare",
        tokSRef: [
            { equipo: "MacBook Air M2 · 8 GB (autor: 5,1–6,3 tok/s)", tokS: 5.1 },
            { equipo: "MacBook Pro M5 Pro · 24 GB (autor: 31–35 tok/s)", tokS: 31 },
        ],
        notas:
            "ramMinGb es la RAM total del equipo (objetivo del autor: 8 GB); el modelo ocupa ~2 GB " +
            "residentes (núcleo compartido + caché KV) y lee del SSD solo los expertos de cada token. " +
            "Los pesos (~15 GB de descarga, ~14,3 GB instalados en .gturbo) van en el SSD interno o en uno " +
            "externo por USB-C 10 Gb/s o Thunderbolt de la MISMA neurona: nunca en la nube ni por red. " +
            "Pesos MLX 4-bit (grupo 64), router 8-bit y expertos 4-bit. Se prepara con " +
            "`swift run -c release TurboFieldfareRepack --output scratch/gemma4.gturbo --overwrite` y se sirve " +
            "con `.build/release/TurboFieldfareServer --model scratch/gemma4.gturbo` (OpenAI-compatible " +
            "experimental: solo bucle local, sin TLS; chat completions, streaming y declaración de " +
            "herramientas). Solo texto; un proceso dueño del modelo a la vez. Los pesos de Gemma 4 " +
            "conservan su licencia de origen.",
        estado: "experimental",
        origen: "biblioteca",
    },
];

/* ───────────────────────────── 3. Especificaciones locales ───────────────────────────── */

/** Lo que `ModelSpec` no dice (bits, formato, runtime…), por id. `generico` = tramo de modelos. */
interface Complemento {
    familia: string;
    capacidades: Capacidad[];
    bits: Bits;
    formato: string;
    runtime: string;
    parametrosB: number;
    medios: MedioApp[];
    licencia: string;
    upstream: string;
    estado: RequisitosModelo["estado"];
    /** Tramo genérico («Ollama 7–8B»): el tamaño depende del modelo elegido → se pregunta. */
    generico?: boolean;
    servidor?: RequisitosModelo["servidor"];
    notas?: string;
}

const COMPLEMENTOS: Record<string, Complemento> = {
    "astraura-158": {
        familia: "microsoft/BitNet", capacidades: ["texto", "razon"], bits: 1.58, formato: "gguf", runtime: "bitnet-cpp",
        parametrosB: 2, medios: ["nativo", "servidor"], licencia: "MIT", upstream: "https://github.com/StarSeedSystem/astraura",
        estado: "recomendado", servidor: { protocolo: "openai", url: "http://127.0.0.1:8790/v1" },
        notas: "Sistema primario del OS: los mismos pesos que la capa bitnet-b1.58-2b-4t servidos por el backend Astraura 1.58.",
    },
    "chrome-ai": {
        familia: "google/gemini-nano", capacidades: ["texto"], bits: 4, formato: "propio", runtime: "chrome-ai",
        parametrosB: 3.25, medios: ["web", "pwa"], licencia: "Términos de Google (integrado en Chrome)",
        upstream: "https://developer.chrome.com/docs/ai/built-in", estado: "respaldo",
        notas: "Lo descarga y guarda el propio Chrome de escritorio (Prompt API): no se elige dónde se almacena.",
    },
    "smolvlm2-webgpu": {
        familia: "HuggingFaceTB/SmolVLM2", capacidades: ["vision"], bits: 8, formato: "onnx", runtime: "webgpu-onnx",
        parametrosB: 0.256, medios: ["web", "pwa"], licencia: "Apache-2.0",
        upstream: "https://huggingface.co/HuggingFaceTB/SmolVLM2-256M-Video-Instruct", estado: "respaldo",
        notas: "Variante 256M (~250 MB); la de 500M ocupa más.",
    },
    "smollm3-webgpu": {
        familia: "HuggingFaceTB/SmolLM3", capacidades: ["texto", "razon"], bits: 4, formato: "onnx", runtime: "webgpu-onnx",
        parametrosB: 3, medios: ["web", "pwa"], licencia: "Apache-2.0",
        upstream: "https://huggingface.co/HuggingFaceTB/SmolLM3-3B-ONNX", estado: "respaldo",
    },
    webllm: {
        familia: "mlc-ai/web-llm", capacidades: ["texto"], bits: 4, formato: "mlc", runtime: "webllm", parametrosB: 3,
        medios: ["web", "pwa"], licencia: "Apache-2.0 (runtime; pesos según el modelo)", upstream: "https://github.com/mlc-ai/web-llm",
        estado: "respaldo", generico: true, notas: "Llama 3.2 3B o Qwen3 4B (q4f16): el tamaño depende del que se elija.",
    },
    "ollama-small": {
        familia: "ollama", capacidades: ["texto"], bits: 4, formato: "gguf", runtime: "ollama", parametrosB: 3,
        medios: ["nativo", "servidor"], licencia: "MIT (runtime; pesos según el modelo)", upstream: "https://github.com/ollama/ollama",
        estado: "respaldo", generico: true, servidor: { protocolo: "openai", url: "http://127.0.0.1:11434/v1" },
    },
    "ollama-mid": {
        familia: "ollama", capacidades: ["texto", "razon"], bits: 4, formato: "gguf", runtime: "ollama", parametrosB: 8,
        medios: ["nativo", "servidor"], licencia: "MIT (runtime; pesos según el modelo)", upstream: "https://github.com/ollama/ollama",
        estado: "respaldo", generico: true, servidor: { protocolo: "openai", url: "http://127.0.0.1:11434/v1" },
    },
    "ollama-large": {
        familia: "ollama", capacidades: ["texto", "razon"], bits: 4, formato: "gguf", runtime: "ollama", parametrosB: 14,
        medios: ["nativo", "servidor"], licencia: "MIT (runtime; pesos según el modelo)", upstream: "https://github.com/ollama/ollama",
        estado: "respaldo", generico: true, servidor: { protocolo: "openai", url: "http://127.0.0.1:11434/v1" },
    },
    piper: {
        familia: "rhasspy/piper", capacidades: ["voz-tts"], bits: 32, formato: "onnx", runtime: "onnx", parametrosB: 0.02,
        medios: ["nativo", "servidor"], licencia: "MIT", upstream: "https://github.com/rhasspy/piper", estado: "respaldo",
        notas: "El tamaño depende de la voz elegida (de ~20 a ~120 MB).",
    },
    kokoro: {
        familia: "hexgrad/Kokoro", capacidades: ["voz-tts"], bits: 32, formato: "onnx", runtime: "onnx", parametrosB: 0.082,
        medios: ["web", "pwa", "nativo", "servidor"], licencia: "Apache-2.0", upstream: "https://huggingface.co/hexgrad/Kokoro-82M",
        estado: "respaldo", notas: "En el navegador corre con kokoro-js (WebGPU o WASM).",
    },
    openvoice: {
        familia: "myshell-ai/OpenVoice", capacidades: ["voz-tts"], bits: 32, formato: "pytorch", runtime: "pytorch", parametrosB: 0,
        medios: ["nativo", "servidor"], licencia: "MIT", upstream: "https://github.com/myshell-ai/OpenVoice", estado: "respaldo",
        notas: "Clonación por referencia de audio. Parámetros sin publicar.",
    },
    coqui: {
        familia: "coqui/XTTS-v2", capacidades: ["voz-tts"], bits: 32, formato: "pytorch", runtime: "pytorch", parametrosB: 0.467,
        medios: ["nativo", "servidor"], licencia: "CPML (no comercial)", upstream: "https://huggingface.co/coqui/XTTS-v2",
        estado: "en-pruebas",
    },
    bark: {
        familia: "suno-ai/bark", capacidades: ["voz-tts"], bits: 32, formato: "pytorch", runtime: "pytorch", parametrosB: 0.9,
        medios: ["nativo", "servidor"], licencia: "MIT", upstream: "https://github.com/suno-ai/bark", estado: "en-pruebas",
    },
    gptsovits: {
        familia: "RVC-Boss/GPT-SoVITS", capacidades: ["voz-tts"], bits: 32, formato: "pytorch", runtime: "pytorch", parametrosB: 0,
        medios: ["nativo", "servidor"], licencia: "MIT", upstream: "https://github.com/RVC-Boss/GPT-SoVITS", estado: "en-pruebas",
        notas: "Parámetros sin publicar.",
    },
};

/**
 * Supertonic 3, la voz favorita de Alex (F1). Datos copiados de
 * `native/astraura-voice/conversacion/voz_rt.py` y `voz_rt_logica.py` (66 M parámetros, ONNX,
 * 31 idiomas, ~0,5 GB residentes, RTF 0,26 en la Mac de 8 GB): el servidor de voz es de
 * servidor y no se importa aquí.
 */
const SUPERTONIC_3: RequisitosModelo = {
    id: "supertonic-3",
    nombre: "Supertonic 3 (voz F1)",
    familia: "Supertone/Supertonic",
    capacidades: ["voz-tts"],
    bits: 32,
    formato: "onnx",
    runtime: "onnx",
    parametrosB: 0.066,
    disco: { gb: 0.27, verificado: false },
    ramMinGb: 2,
    almacenamiento: { modo: "carga-completa", soloLocal: false },
    servidor: { protocolo: "propio", url: "http://127.0.0.1:4460" },
    medios: ["web", "pwa", "nativo", "servidor"],
    licencia: "MIT (código) · pesos con la licencia del modelo de Supertone",
    upstream: "https://github.com/supertone-oss-archive/supertonic",
    notas:
        "Voz de borde sin GPU (ONNX en CPU o WebAssembly SIMD), 31 idiomas con español. Ocupa ~0,5 GB " +
        "residentes; en la Mac de 8 GB habla cuatro veces más rápido que el tiempo real (RTF 0,26). " +
        "Tamaño en disco estimado a partir de sus 66 M parámetros: sin medir.",
    estado: "recomendado",
    origen: "catalogo-local",
};

/** Acelerador que pide una especificación (WebGPU, o GPU dedicada cuando es «requerida»). */
function aceleradoresDeSpec(spec: ModelSpec): Acelerador[] | undefined {
    if (spec.req.webgpu) return ["webgpu"];
    if (spec.req.gpu === "requerida") return ["cuda", "rocm", "metal"];
    return undefined;
}

/** Especificaciones locales (`access: "local"`) → requisitos del contrato. Lo desconocido se pregunta. */
export function modelosLocales(specs: ModelSpec[]): RequisitosModelo[] {
    const salida: RequisitosModelo[] = [];
    for (const spec of specs) {
        if (spec.access !== "local") continue;
        const c = COMPLEMENTOS[spec.id];
        const runtime = c?.runtime ?? spec.engine.toLowerCase().replace(/\s+/g, "-");
        const formato = c?.formato ?? "desconocido";
        const enNavegador = !!spec.req.webgpu || !!spec.req.chromeAi;
        const tamano = c?.generico ? null : esPositivo(spec.req.approxSizeGb) ? spec.req.approxSizeGb : null;
        const notas = [spec.note, c?.notas, c ? undefined : "Sin ficha técnica en el catálogo: bits y tamaño por confirmar."]
            .filter(esTexto)
            .join(" ");

        const entrada: RequisitosModelo = {
            id: spec.id,
            nombre: spec.label,
            familia: c?.familia ?? spec.engine,
            capacidades: c?.capacidades ?? (spec.kind === "voz" ? ["voz-tts"] : ["texto"]),
            bits: c?.bits ?? bitsDeModelo({ id: spec.id, modelo: spec.label, runtime, formato }),
            formato,
            runtime,
            parametrosB: c?.parametrosB ?? 0,
            disco: { gb: tamano, verificado: false },
            ramMinGb: esPositivo(spec.req.minRamGb) ? spec.req.minRamGb : 0,
            almacenamiento: {
                modo: formato === "gguf" ? "mmap" : "carga-completa",
                // Lo del navegador vive en la caché de ESE navegador: no se lee por red.
                soloLocal: enNavegador,
            },
            medios: c?.medios ?? (enNavegador ? ["web", "pwa"] : ["nativo", "servidor"]),
            licencia: c?.licencia ?? "por-verificar",
            upstream: c?.upstream ?? "",
            estado: c?.estado ?? "en-pruebas",
            origen: "catalogo-local",
        };
        if (esPositivo(spec.req.minVramGb)) entrada.vramMinGb = spec.req.minVramGb;
        const acel = aceleradoresDeSpec(spec);
        if (acel) entrada.aceleradoresRequeridos = acel;
        if (c?.servidor) entrada.servidor = c.servidor;
        if (notas) entrada.notas = notas;
        salida.push(entrada);
    }
    return salida;
}

/* ───────────────────────────── Orden y catálogo ───────────────────────────── */

const ORDEN_ESTADO: Record<RequisitosModelo["estado"], number> = {
    recomendado: 0,
    respaldo: 1,
    "en-pruebas": 2,
    experimental: 3,
};

/** 1.58-bit primero, luego recomendado › respaldo › en-pruebas › experimental, luego más potente. */
export function ordenarPorPrioridad(lista: RequisitosModelo[]): RequisitosModelo[] {
    return [...lista].sort(
        (a, b) =>
            Number(b.bits === 1.58) - Number(a.bits === 1.58) ||
            ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] ||
            b.parametrosB - a.parametrosB ||
            a.id.localeCompare(b.id), // desempate estable: mismo orden en todas las neuronas
    );
}

/**
 * (integración) Modelos de imagen del catálogo de Imágenes locales (`src/lib/imagenes/modelos.ts`,
 * IMG1011): sin ellos «Imágenes» salía «sin opción». El tamaño NO se asume: el repositorio de
 * Hugging Face trae todas las variantes y lo que se descarga es menos, así que `disco.gb` queda en
 * null y el panel pregunta (regla de Alex). Sin `ramGB` el modelo solo corre en una GPU con VRAM.
 */
export function modelosDeImagen(lista: readonly ModeloImagen[]): RequisitosModelo[] {
    return lista.map((m) => {
        const enCpu = m.ramGB > 0;
        const web = m.motores.includes("onnx-web");
        const sdcpp = m.motores.includes("sdcpp");
        const medios: MedioApp[] = [
            ...(web ? (["web", "pwa"] as const) : []),
            ...(m.motores.some((x) => x !== "onnx-web") ? (["nativo", "servidor"] as const) : []),
        ];
        const notas = [
            m.nota,
            m.repoGB ? `El repositorio completo pesa ${m.repoGB} GB con todas sus variantes: lo que se descarga es menos y depende de la variante.` : undefined,
            m.gated ? "Hay que aceptar sus términos con una cuenta de Hugging Face antes de descargarlo." : undefined,
            `${m.resolucion} px · ${m.pasos} paso(s) · ${m.capacidades.join(", ")}.`,
        ].filter(Boolean);
        return {
            id: `img-${m.id}`,
            nombre: m.nombre,
            familia: m.id,
            capacidades: ["imagen"],
            bits: 16,
            formato: sdcpp ? "gguf" : web ? "onnx" : "safetensors",
            runtime: sdcpp ? "sdcpp" : web ? "webgpu-onnx" : m.motores[0] ?? "diffusers",
            parametrosB: 0,
            disco: { gb: null, verificado: false },
            ramMinGb: enCpu ? m.ramGB : Math.max(8, m.vramGB),
            ...(enCpu ? {} : { vramMinGb: m.vramGB, aceleradoresRequeridos: ["cuda", "rocm", "metal"] as Acelerador[] }),
            almacenamiento: { modo: "carga-completa", soloLocal: false },
            medios,
            licencia: m.licencia,
            upstream: `https://huggingface.co/${m.hf}`,
            notas: notas.join(" "),
            estado: m.uso === "libre" ? "recomendado" : "respaldo",
            origen: "catalogo-local",
        } satisfies RequisitosModelo;
    });
}

let memo: RequisitosModelo[] | null = null;

/** Catálogo completo: capas + especificaciones locales + extras, sin duplicados, 1.58-bit primero. */
export function catalogoRecursos(): RequisitosModelo[] {
    if (!memo) {
        const vistos = new Set<string>();
        const unicos: RequisitosModelo[] = [];
        const todos = [
            ...modelosDeCapas(capasJson),
            ...MODELOS_EXTRA,
            ...modelosLocales([...LOCAL_LLM_SPECS, ...LOCAL_VOICE_SPECS]),
            SUPERTONIC_3,
            ...modelosDeImagen(MODELOS_IMAGEN),
        ];
        for (const m of todos) {
            if (vistos.has(m.id)) continue; // gana la fuente con más verdad (capas › extras › locales)
            vistos.add(m.id);
            unicos.push(m);
        }
        memo = ordenarPorPrioridad(unicos);
    }
    // Copia: quien ordene o filtre el resultado no toca la memoria compartida.
    return [...memo];
}

export function modeloPorId(id: string, catalogo: RequisitosModelo[] = catalogoRecursos()): RequisitosModelo | undefined {
    return catalogo.find((m) => m.id === id);
}
