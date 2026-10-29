/**
 * Compatibilidad modelo ↔ procesador ↔ almacén (SOP `architecture/recursos-ia-neurona.md` §3).
 *
 * PURO: lo importa el navegador (nada de `node:*`, React ni Supabase). Nunca lanza.
 *
 * Reglas que manda el SOP y que aquí no se negocian:
 * - Lo que no se sabe se DICE (motivo que no bloquea), nunca se supone en silencio.
 * - Tamaño desconocido ⇒ nivel «preguntar»: no se reserva sitio a ciegas (regla de Alex).
 * - Pesos que se leen en cada token (`streaming-ssd`) o `soloLocal` ⇒ disco de la MISMA neurona.
 * - Por antena no viajan pesos. Lo privado no sale a un almacén o procesador ajeno.
 */
import { estimateTps, GPU_BANDWIDTH_GBPS } from "@/ai/astraura/model-fit";
import type {
    Acelerador,
    Arquitectura,
    Bits,
    Capacidad,
    Compatibilidad,
    MedioAlmacen,
    MedioApp,
    Motivo,
    NivelCompat,
    Procesador,
    RequisitosModelo,
    TipoDisco,
    Via,
} from "./tipos";
import { VIA_REFERENCIA } from "./tipos";
import { cuantizacionesPara, FUENTE_METODOS_HF, type DispositivoHF } from "./cuantizacion-hf";

export interface ContextoCompat {
    /** Tamaño confirmado por la persona (GB) cuando el catálogo no lo sabe. */
    tamanoConfirmadoGb?: number;
    /** Vía por la que el procesador lee el almacén (si no es la misma neurona). */
    viaAlmacen?: Via;
    /** Alcance privado: exige almacén privado y procesador propio. */
    privado?: boolean;
    /**
     * (Añadido aquí: el contrato no lo trae.) El procesador es de la cuenta o del grupo dueño.
     * Si falta, se considera propio todo lo que no sea `servidor` ni se alcance por internet.
     */
    propio?: boolean;
    /**
     * (Añadido aquí.) Para qué se va a usar: en «razón» pesa más la potencia que la velocidad;
     * en «decisión», al revés (un reflejo tiene que ser inmediato).
     */
    capacidad?: Capacidad;
    /** (Añadido aquí.) Ya está en ese almacén o sirviendo en ese procesador: no hay que descargar. */
    instalado?: boolean;
}

/** Espacio que se deja libre en un disco después de instalar: el sistema necesita sitio. */
export const MARGEN_DISCO_GB = 2;
/** Los sistemas informan 7,8 GB para 8 GB físicos: no se rechaza por esa diferencia. */
const TOLERANCIA_RAM_GB = 0.3;
/** Velocidades de texto: cómodo para conversar y mínimo usable. */
const TOKS_COMODO = 15;
const TOKS_USABLE = 5;
/** Más de esto en cargar (s) ya no es «abrir y usar». */
const CARGA_RAPIDA_S = 60;
const CARGA_LENTA_S = 300;
/** Núcleo + caché KV que TurboFieldfare deja en RAM (SOP §5): el resto se lee del SSD. */
const RESIDENTE_STREAMING_GB = 2.5;

/* ───────────────────────────── utilidades de texto ───────────────────────────── */

/** 9.2 → "9,2"; 8 → "8". Sin `toLocaleString`: el ICU del entorno cambiaría el resultado. */
export function numeroEs(n: number, decimales = 1): string {
    const f = 10 ** decimales;
    return String(Math.round(n * f) / f).replace(".", ",");
}

export function duracionEs(segundos: number): string {
    if (segundos < 90) return `${Math.max(1, Math.round(segundos))} s`;
    if (segundos < 5400) return `${Math.round(segundos / 60)} min`;
    if (segundos < 172800) return `${Math.round(segundos / 3600)} h`;
    return `${Math.round(segundos / 86400)} días`;
}

/** 0.12 → "123 MB"; 14.3 → "14,3 GB". */
export function tamanoEs(gb: number): string {
    return gb < 1 ? `${Math.max(1, Math.round(gb * 1024))} MB` : `${numeroEs(gb)} GB`;
}

function lista(xs: string[], conector = "o"): string {
    if (xs.length <= 1) return xs[0] ?? "";
    return `${xs.slice(0, -1).join(", ")} ${conector} ${xs[xs.length - 1]}`;
}

const NOMBRE_ACELERADOR: Record<Acelerador, string> = {
    metal: "Metal",
    metal4: "Metal 4",
    cuda: "CUDA (NVIDIA)",
    rocm: "ROCm (AMD)",
    vulkan: "Vulkan",
    webgpu: "WebGPU",
    "wasm-simd": "WebAssembly SIMD",
    neon: "NEON (ARM)",
    avx2: "AVX2",
    avx512: "AVX-512",
    coreml: "Core ML",
    ane: "Neural Engine de Apple",
};

const NOMBRE_ARQUITECTURA: Record<Arquitectura, string> = {
    arm64: "ARM de 64 bits (Apple Silicon, Ampere, móviles)",
    x86_64: "Intel/AMD de 64 bits",
    wasm: "WebAssembly (navegador)",
    otra: "otra arquitectura",
};

/* ───────────────────────────── sistema operativo ───────────────────────────── */

const NOMBRE_SO: Record<string, string> = {
    macos: "macOS",
    ios: "iOS",
    android: "Android",
    windows: "Windows",
    linux: "Linux",
    navegador: "un navegador",
};

/** Familia normalizada: «macOS 26.3.1» → macos, «Ubuntu 24.04» → linux. */
export function familiaSo(texto: string): string {
    const t = texto.toLowerCase();
    if (/mac\s?os|darwin|os x/.test(t)) return "macos";
    if (/ipados|\bios\b|iphone|ipad/.test(t)) return "ios";
    if (/android/.test(t)) return "android";
    if (/windows/.test(t)) return "windows";
    if (/navegador|browser|\bweb\b/.test(t)) return "navegador";
    if (/linux|ubuntu|debian|fedora|oracle|arch|alpine|centos|rhel|raspbian/.test(t)) return "linux";
    return t.trim();
}

function versionDe(texto: string): number[] | undefined {
    const m = /(\d+(?:\.\d+)*)/.exec(texto);
    return m ? m[1].split(".").map(Number) : undefined;
}

function compararVersion(a: number[], b: number[]): number {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const d = (a[i] ?? 0) - (b[i] ?? 0);
        if (d !== 0) return d;
    }
    return 0;
}

interface ReqSo {
    familia: string;
    version?: number[];
    texto: string;
}

/** «macOS>=26» → {macos, [26]}. Una versión sin operador también es un mínimo («Windows 11»). */
function leerReqSo(r: string): ReqSo {
    const m = /^(.*?)\s*(?:>=|=)?\s*(\d+(?:\.\d+)*)?\s*$/.exec(r.trim());
    const nombre = (m?.[1] ?? r).trim() || r;
    const version = m?.[2] ? m[2].split(".").map(Number) : undefined;
    const familia = familiaSo(nombre);
    const visible = NOMBRE_SO[familia] ?? nombre;
    return { familia, version, texto: version ? `${visible} ${version.join(".")} o superior` : visible };
}

/* ───────────────────────────── herramientas ───────────────────────────── */

interface Herramienta {
    nombre: string;
    version?: number[];
}

/** «swift-6.0.2» → {swift, [6,0,2]}; «xcode-26» → {xcode, [26]}. */
function leerHerramienta(h: string): Herramienta {
    const m = /^(.*?)[-\s@]?(\d+(?:\.\d+)*)$/.exec(h.trim().toLowerCase());
    if (!m || !m[1]) return { nombre: h.trim().toLowerCase() };
    return { nombre: m[1].replace(/[-\s@]+$/, ""), version: m[2].split(".").map(Number) };
}

function textoHerramienta(h: Herramienta): string {
    const nombre = h.nombre === "swift" ? "Swift" : h.nombre === "xcode" ? "Xcode" : h.nombre;
    return h.version ? `${nombre} ${h.version.join(".")}` : nombre;
}

/** Xcode 26 trae Swift 6.2: quien lo tiene, cumple. */
const SWIFT_DE_XCODE: [number, number[]][] = [
    [26, [6, 2]],
    [16, [6, 0]],
    [15, [5, 9]],
];

function cumpleHerramienta(req: Herramienta, tiene: Herramienta[]): boolean {
    for (const h of tiene) {
        if (h.nombre === req.nombre && (!req.version || (h.version && compararVersion(h.version, req.version) >= 0))) {
            return true;
        }
        if (req.nombre === "swift" && h.nombre === "xcode" && h.version && req.version) {
            const trae = SWIFT_DE_XCODE.find(([x]) => (h.version?.[0] ?? 0) >= x)?.[1];
            if (trae && compararVersion(trae, req.version) >= 0) return true;
        }
    }
    return false;
}

function arregloHerramienta(req: Herramienta, actual?: Herramienta): string {
    const v = req.version?.join(".") ?? "";
    if (req.nombre === "swift") {
        return (
            `Actualiza a Xcode 26 o a las Command Line Tools con Swift ${v}: Xcode 26 desde la App Store, ` +
            `o en Terminal \`xcode-select --install\`${actual ? ` (ahora tienes ${textoHerramienta(actual)})` : ""}.`
        );
    }
    if (req.nombre === "xcode") return `Instala Xcode ${v} o posterior desde la App Store (gratis; ocupa varios GB, cuenta con ese sitio).`;
    return `Instala ${textoHerramienta(req)} o superior en esta neurona.`;
}

/* ───────────────────────────── runtimes y medios ───────────────────────────── */

/** Medios en los que puede correr un modelo sobre este procesador. */
export function mediosDeProcesador(p: Procesador): MedioApp[] {
    if (p.tipo === "webgpu") return ["web", "pwa"];
    if (p.tipo === "servidor") return ["servidor"];
    return ["nativo", "servidor"];
}

/** ¿Se puede instalar este runtime aquí? Nada de adivinar: solo reglas de plataforma conocidas. */
function runtimePosible(runtime: string, p: Procesador): { ok: boolean; porque?: string } {
    const r = runtime.toLowerCase();
    if (r.includes("webgpu") || r.includes("web-llm")) {
        return p.aceleradores.includes("webgpu") ? { ok: true } : { ok: false, porque: "necesita WebGPU" };
    }
    // Los runtimes WebAssembly corren en el navegador y en cualquier sistema con Node.
    if (r.includes("wasm")) return { ok: true };
    if (p.tipo === "webgpu") return { ok: false, porque: "es un programa nativo y el navegador no lo puede ejecutar" };
    // (integración) Una NPU solo ejecuta modelos convertidos para ella (Core ML/ANE, QNN, OpenVINO):
    // sin esto el plan mandaba BitNet al Neural Engine.
    if (p.tipo === "npu" && !/coreml|ane|qnn|openvino|npu/.test(r)) {
        return { ok: false, porque: "la unidad neuronal solo ejecuta modelos convertidos para ella (Core ML, QNN, OpenVINO)" };
    }
    // bitnet.cpp son núcleos de CPU (solo hay núcleos de GPU para CUDA): en una GPU Metal se usa la CPU.
    if (r.includes("bitnet") && p.tipo === "gpu" && !p.aceleradores.includes("cuda")) {
        return { ok: false, porque: "BitNet 1.58 corre en la CPU (sus núcleos de GPU son solo para CUDA)" };
    }
    if (/mlx|swift|metal|coreml|turbo-fieldfare/.test(r)) {
        const mac = p.so ? familiaSo(p.so) === "macos" : false;
        if (!mac || p.arquitectura === "x86_64") return { ok: false, porque: "solo existe para Mac con Apple Silicon" };
    }
    return { ok: true };
}

/* ───────────────────────────── tamaño y disco ───────────────────────────── */

/** Tamaño instalado (GB) o null si nadie lo sabe todavía. */
export function tamanoModeloGb(modelo: RequisitosModelo, confirmadoGb?: number): number | null {
    if (typeof confirmadoGb === "number" && confirmadoGb > 0) return confirmadoGb;
    return typeof modelo.disco.gb === "number" ? modelo.disco.gb : null;
}

/** Lo que hay que tener libre para instalarlo: la descarga puede pesar más que lo instalado. */
export function espacioNecesarioGb(modelo: RequisitosModelo, confirmadoGb?: number): number | null {
    const gb = tamanoModeloGb(modelo, confirmadoGb);
    if (gb === null) return null;
    // Si la persona confirmó un tamaño, ese manda (la descarga del catálogo es de otra variante).
    const descarga = typeof confirmadoGb === "number" && confirmadoGb > 0 ? 0 : (modelo.disco.descargaGb ?? 0);
    return Math.max(gb, descarga);
}

/** ¿Caben `gb` en el almacén dejando `margenGb` libres? */
export function cabeEn(almacen: MedioAlmacen, gb: number, margenGb = MARGEN_DISCO_GB): boolean {
    return typeof almacen.libreGb === "number" && almacen.libreGb - gb >= margenGb;
}

const LECTURA_TIPICA: Record<TipoDisco, number> = {
    nvme: 2000,
    ssd: 500,
    hdd: 120,
    sd: 60,
    red: 40,
    desconocido: 300,
};

function peorVia(a: Via, b: Via): Via {
    return VIA_REFERENCIA[a].mbs <= VIA_REFERENCIA[b].mbs ? a : b;
}

/** Cómo llegan los pesos del almacén al procesador (las vías del inventario son desde ESTA neurona). */
export function viaDeCarga(p: Procesador, a: MedioAlmacen, ctx: ContextoCompat = {}): Via {
    if (ctx.viaAlmacen) return ctx.viaAlmacen;
    if (a.neuronaId && a.neuronaId === p.neuronaId) return "local";
    if (p.via === "local") return a.via;
    if (a.via === "local") return p.via;
    return peorVia(p.via, a.via);
}

/* ───────────────────────────── cuantización transformers según dispositivo ───────────────────────────── */

/** Dispositivo de la tabla de cuantización de transformers que mejor describe el procesador. */
export function dispositivoHFde(p: Procesador): DispositivoHF {
    const a = p.aceleradores;
    if (a.includes("metal") || a.includes("metal4")) return "metal";
    if (a.includes("cuda")) return "cuda";
    if (a.includes("rocm")) return "rocm";
    if (a.includes("avx2") || a.includes("avx512") || p.arquitectura === "x86_64") return "intel";
    return "cpu";
}

/** La tabla no vale para ternarios ni binarios (BitNet, Ternary Bonsai) ni para modelos de 8 bits o menos. */
function cuantizable(m: RequisitosModelo): boolean {
    return m.bits >= 8 && !/bitnet|bonsai|ternar|1\.58/i.test(`${m.id} ${m.familia} ${m.nombre}`);
}

/**
 * (cableado de la matriz de transformers, tarea CPZ1025G) Cuando por memoria «no cabe», el arreglo
 * añade con qué método de la tabla se podría cuantizar a menos bits ESE dispositivo, con enlace.
 */
function arregloConCuantizacion(p: Procesador, m: RequisitosModelo, base: string): string {
    if (!cuantizable(m)) return base;
    const d = dispositivoHFde(p);
    const metodos = cuantizacionesPara(d)
        .filter((x) => x.bitsMin < m.bits)
        .slice(0, 3)
        .map((x) => `${x.nombre}${x.soporte[d] === "parcial" ? " (soporte parcial)" : ""} (${x.enlace})`);
    return metodos.length
        ? `${base} Quien use transformers puede cuantizarlo a menos bits con ${metodos.join(", ")}. Fuente: ${FUENTE_METODOS_HF}.`
        : base;
}

/* ───────────────────────────── velocidad ───────────────────────────── */

/** M5 aún no está en la tabla de llmfit. Solo cifras publicadas por Apple. */
const BANDA_EXTRA: Record<string, number> = { "Apple M5": 153 };

function familiaChip(texto: string): "apple" | "nvidia" | "amd" | "otra" {
    const t = texto.toLowerCase();
    if (/apple|mac|\bm[1-9]\b/.test(t)) return "apple";
    if (/nvidia|geforce|rtx|gtx|\ba100\b|\bh100\b|\bl4\b|\bt4\b|\bl40\b|\bv100\b/.test(t)) return "nvidia";
    if (/radeon|\brx\s?\d/.test(t)) return "amd";
    return "otra";
}

/**
 * Chip y ancho de banda de memoria (GB/s) que nombra un texto: «MacBook Air M2 · 8 GB» → Apple M2,
 * 100. Para Apple se lee el «M<n> [Pro|Max|Ultra]» (la tabla de llmfit espera «Apple M2»).
 */
export function chipDeTexto(texto: string): { chip: string; gbps: number } | undefined {
    const t = texto.trim();
    if (!t) return undefined;
    const apple = /\bM([1-9])(?:\s+(Pro|Max|Ultra))?\b/i.exec(t);
    if (apple && familiaChip(t) === "apple") {
        const sufijo = apple[2] ? ` ${apple[2][0].toUpperCase()}${apple[2].slice(1).toLowerCase()}` : "";
        const chip = `Apple M${apple[1]}${sufijo}`;
        const gbps = GPU_BANDWIDTH_GBPS[chip] ?? BANDA_EXTRA[chip];
        return gbps ? { chip, gbps } : undefined;
    }
    // El resto: coincidencia más larga sobre la tabla (como `gpuBandwidthGbps`, pero con la clave).
    const bajo = t.toLowerCase();
    let mejor: { chip: string; gbps: number } | undefined;
    for (const [chip, gbps] of Object.entries(GPU_BANDWIDTH_GBPS)) {
        if (bajo.includes(chip.toLowerCase()) && (!mejor || chip.length > mejor.chip.length)) mejor = { chip, gbps };
    }
    return mejor;
}

/** Ancho de banda de memoria del procesador; `medido:false` = por tipo, orientativo. */
function bandaProcesador(p: Procesador): { gbps: number; chip?: string; medido: boolean } {
    const chip = chipDeTexto(p.nombre);
    if (chip) return { gbps: chip.gbps, chip: chip.chip, medido: true };
    const n = p.nucleos ?? 4;
    switch (p.tipo) {
        case "gpu": {
            const v = p.vramGb ?? 0;
            const gbps = p.memoriaUnificada ? 100 : v >= 24 ? 900 : v >= 16 ? 500 : v >= 12 ? 360 : v >= 8 ? 300 : 200;
            return { gbps, medido: false };
        }
        case "webgpu":
            return { gbps: (p.ramGb ?? 0) >= 16 ? 50 : 25, medido: false };
        case "npu":
            return { gbps: 30, medido: false };
        case "servidor":
            return { gbps: 100, medido: false };
        default:
            // CPU: un servidor de pocos núcleos (A1 de 2 OCPU) no llega a todo el ancho del zócalo.
            return { gbps: p.arquitectura === "x86_64" ? Math.min(50, 8 * n) : Math.min(30, 10 * n), medido: false };
    }
}

function esDeTexto(m: RequisitosModelo): boolean {
    return m.capacidades.some((c) => c === "texto" || c === "razon" || c === "decision");
}

const BPP_POR_BITS: Record<Bits, number> = {
    1: 0.145,
    1.58: 0.27,
    2: 0.3,
    3: 0.45,
    4: 0.58,
    5: 0.68,
    6: 0.8,
    8: 1.05,
    16: 2,
    32: 4,
};

function ramDe(texto: string): number | undefined {
    const m = /(\d+(?:[.,]\d+)?)\s*GB/i.exec(texto);
    return m ? Number(m[1].replace(",", ".")) : undefined;
}

/** Referencia medida más parecida: mismo chip; si no, misma familia con ancho conocido y RAM cercana. */
function referenciaParecida(
    refs: { equipo: string; tokS: number }[],
    p: Procesador,
    banda: { gbps: number; chip?: string; medido: boolean },
): number | undefined {
    const familia = banda.chip ? familiaChip(banda.chip) : familiaChip(p.nombre);
    const ram = p.ramGb;
    let elegida: { tokS: number; peso: number } | undefined;
    for (const r of refs) {
        if (!(r.tokS > 0)) continue;
        const chip = chipDeTexto(r.equipo);
        if (familiaChip(r.equipo) !== familia || familia === "otra") continue;
        const ramRef = ramDe(r.equipo);
        const difRam = ram && ramRef ? Math.abs(Math.log2(ram / ramRef)) : 1;
        if (chip && banda.chip && chip.chip === banda.chip) {
            const peso = difRam;
            if (!elegida || peso < elegida.peso) elegida = { tokS: r.tokS, peso };
            continue;
        }
        if (!chip || !banda.medido) continue;
        // Escalar por ancho de banda: el cuello de un LLM al generar es leer los pesos activos.
        const peso = 10 + difRam * 2 + Math.abs(Math.log2(banda.gbps / chip.gbps));
        if (!elegida || peso < elegida.peso) elegida = { tokS: (r.tokS * banda.gbps) / chip.gbps, peso };
    }
    return elegida?.tokS;
}

/** Tokens por segundo estimados (texto) o undefined si no aplica. */
export function estimarTokS(modelo: RequisitosModelo, procesador: Procesador): number | undefined {
    if (!esDeTexto(modelo)) return undefined;
    const banda = bandaProcesador(procesador);
    const ref = modelo.tokSRef?.length ? referenciaParecida(modelo.tokSRef, procesador, banda) : undefined;
    if (ref !== undefined) return Math.round(ref * 10) / 10;

    // Roofline de llmfit: bytes que se leen por token = parámetros ACTIVOS × bytes por parámetro.
    const params = Math.max(0.05, modelo.parametrosB || 0);
    const bpp = typeof modelo.disco.gb === "number" && modelo.disco.gb > 0 ? modelo.disco.gb / params : BPP_POR_BITS[modelo.bits] ?? 0.58;
    const gbPorToken = Math.max(0.05, (modelo.activosB ?? params) * bpp);
    const base = estimateTps({ bandwidthGbps: banda.gbps, modelSizeGb: gbPorToken, runMode: "gpu" });
    // Eficiencia real frente al pico según quién calcula. bitnet.cpp está hecho para CPU (tablas
    // ternarias) y rinde más cerca del pico que un llama.cpp genérico en CPU.
    const bitnet = modelo.runtime.toLowerCase().includes("bitnet");
    let factor = 1;
    if (procesador.tipo === "cpu") factor = bitnet ? 0.6 : 0.35;
    else if (procesador.tipo === "gpu" && bitnet) factor = 0.6;
    else if (procesador.tipo === "webgpu") factor = 0.4;
    else if (procesador.tipo === "npu") factor = 0.5;
    // Leer expertos del SSD en cada token cuesta: sin referencia medida, se es prudente.
    if (modelo.almacenamiento.modo === "streaming-ssd") factor *= 0.3;
    return Math.round(base * factor * 10) / 10;
}

/* ───────────────────────────── puntuación ───────────────────────────── */

/** Potencia efectiva (miles de millones): en un MoE cuenta a medias lo que no se activa en cada token. */
export function potenciaB(m: RequisitosModelo): number {
    const total = Math.max(0, m.parametrosB || 0);
    return m.activosB && m.activosB < total ? (m.activosB + total) / 2 : total;
}

/** Bono de puntuación por bits: 1.58 primero (SOP §3), 1-bit casi igual. Lo usa también el plan. */
export function bonoBits(bits: Bits): number {
    if (bits === 1.58) return 15;
    if (bits === 1) return 12;
    if (bits === 2) return 6;
    if (bits === 3) return 4;
    if (bits === 4) return 2;
    return 0;
}

const BONO_VIA: Record<Via, number> = { local: 10, "malla-local": 6, "red-starseed": 3, internet: 1, antena: 0 };
const BONO_ESTADO: Record<RequisitosModelo["estado"], number> = {
    recomendado: 3,
    respaldo: 1,
    "en-pruebas": -1,
    experimental: -2,
};

/** Bloqueos que el hardware o la política no permiten; el resto (RAM, VRAM, disco) es «no cabe». */
const CLAVES_NO_CABE = new Set(["ram", "vram", "disco"]);

/* ───────────────────────────── verificar ───────────────────────────── */

export function verificar(
    modelo: RequisitosModelo,
    procesador: Procesador,
    almacen: MedioAlmacen,
    ctx: ContextoCompat = {},
): Compatibilidad {
    const m = modelo;
    const p = procesador;
    const a = almacen;
    const motivos: Motivo[] = [];
    /** Avisos que bajan un escalón el nivel (no bloquean). */
    let penalizaciones = 0;
    let preguntar = false;
    /** Holguras 0 (justo) · 1 (bueno) · 2 (amplio). */
    let fRam = 1;
    let fDisco = 1;
    let fVel = 2;
    let fCarga = 2;
    let runtimePorInstalar = false;
    const streaming = m.almacenamiento.modo === "streaming-ssd";

    // 1. Sistema operativo (y su versión).
    const reqsSo = m.so ?? [];
    if (reqsSo.length) {
        const familias = new Set<string>();
        if (p.so) familias.add(familiaSo(p.so));
        if (p.tipo === "webgpu") familias.add("navegador");
        const reqs = reqsSo.map(leerReqSo);
        const textoReqs = lista(reqs.map((r) => r.texto));
        if (!familias.size) {
            motivos.push({
                clave: "so",
                texto: `No sé qué sistema tiene ${p.nombre}; ${m.nombre} pide ${textoReqs}.`,
                bloquea: false,
                arreglo: "Vuelve a detectar esta neurona o indica su sistema en su ficha.",
            });
            penalizaciones++;
        } else {
            let resuelto = false;
            let fallo: Motivo | undefined;
            for (const r of reqs) {
                if (!familias.has(r.familia)) continue;
                const v = r.familia !== "navegador" && p.so ? versionDe(p.so) : undefined;
                if (!r.version) {
                    resuelto = true;
                    break;
                }
                if (!v) {
                    motivos.push({
                        clave: "so",
                        texto: `No sé qué versión de ${NOMBRE_SO[r.familia] ?? r.familia} tiene ${p.nombre}; ${m.nombre} pide ${r.texto}.`,
                        bloquea: false,
                        arreglo: "Comprueba la versión en los ajustes del sistema.",
                    });
                    penalizaciones++;
                    resuelto = true;
                    break;
                }
                if (compararVersion(v, r.version) >= 0) {
                    resuelto = true;
                    break;
                }
                fallo = {
                    clave: "so",
                    texto: `${m.nombre} necesita ${r.texto} y ${p.nombre} tiene ${p.so}.`,
                    bloquea: true,
                    arreglo:
                        r.familia === "macos"
                            ? `Actualiza macOS a la ${r.version.join(".")} o superior (Ajustes del Sistema › General › Actualización de software), si tu Mac lo admite.`
                            : `Actualiza ${NOMBRE_SO[r.familia] ?? r.familia} a la ${r.version.join(".")} o superior.`,
                };
            }
            if (!resuelto) {
                motivos.push(
                    fallo ?? {
                        clave: "so",
                        texto: `${m.nombre} solo corre en ${textoReqs} y ${p.nombre} es ${p.so ?? "un navegador"}.`,
                        bloquea: true,
                        arreglo: `Elige una neurona con ${textoReqs}.`,
                    },
                );
            }
        }
    }

    // 2. Arquitectura.
    const archs = m.arquitecturas ?? [];
    if (archs.length) {
        const arch = p.arquitectura ?? (p.tipo === "webgpu" ? "wasm" : undefined);
        if (!arch) {
            motivos.push({
                clave: "arquitectura",
                texto: `No sé qué arquitectura tiene ${p.nombre}; ${m.nombre} es para ${lista(archs.map((x) => NOMBRE_ARQUITECTURA[x]))}.`,
                bloquea: false,
            });
            penalizaciones++;
        } else if (!archs.includes(arch)) {
            motivos.push({
                clave: "arquitectura",
                texto: `${m.nombre} es para ${lista(archs.map((x) => NOMBRE_ARQUITECTURA[x]))} y ${p.nombre} es ${NOMBRE_ARQUITECTURA[arch]}.`,
                bloquea: true,
                arreglo: `Usa una neurona ${lista(archs.map((x) => NOMBRE_ARQUITECTURA[x]))}.`,
            });
        }
    }

    // 3. Aceleradores: basta con uno de los pedidos.
    const acel = m.aceleradoresRequeridos ?? [];
    if (acel.length && !acel.some((x) => p.aceleradores.includes(x))) {
        const metal4SinActualizar = acel.includes("metal4") && p.aceleradores.includes("metal");
        motivos.push({
            clave: "acelerador",
            texto: `${m.nombre} necesita ${lista(acel.map((x) => NOMBRE_ACELERADOR[x]))} y ${p.nombre} no lo tiene.`,
            bloquea: true,
            arreglo: metal4SinActualizar
                ? "Metal 4 llega con macOS 26 en los Mac con chip M1 o posterior: actualiza macOS."
                : `Usa una neurona con ${lista(acel.map((x) => NOMBRE_ACELERADOR[x]))}.`,
        });
    }

    // 4. Medio: un WebGPU de navegador solo corre modelos web/pwa; un nativo no corre en la pestaña.
    const mediosProc = mediosDeProcesador(p);
    if (m.medios.length && !m.medios.some((x) => mediosProc.includes(x))) {
        motivos.push({
            clave: "medio",
            texto: `${m.nombre} corre como ${lista(m.medios)} y ${p.nombre} solo ofrece ${lista(mediosProc)}.`,
            bloquea: true,
            arreglo:
                p.tipo === "webgpu"
                    ? "Usa la app nativa o el servidor local de esta neurona, o un modelo para navegador."
                    : "Ábrelo desde el navegador de la neurona (WebGPU) o elige un modelo nativo.",
        });
    }

    // 5. Runtime: instalado o instalable aquí.
    if (!p.runtimes.includes(m.runtime)) {
        const posible = runtimePosible(m.runtime, p);
        if (posible.ok) {
            runtimePorInstalar = true;
            motivos.push({
                clave: "runtime",
                texto: `Hay que instalar el motor «${m.runtime}» en ${p.nombre}.`,
                bloquea: false,
                arreglo: "Se instala desde la Biblioteca al confirmar la descarga.",
            });
        } else {
            motivos.push({
                clave: "runtime",
                texto: `El motor «${m.runtime}» de ${m.nombre} no puede correr en ${p.nombre}: ${posible.porque}.`,
                bloquea: true,
                arreglo: "Elige un procesador donde exista ese motor o otra versión del modelo.",
            });
        }
    }

    // 6. Herramientas para compilarlo en la neurona: no bloquean el hardware, pero hay que instalarlas.
    const reqHerr = (m.herramientasRequeridas ?? []).map(leerHerramienta);
    if (reqHerr.length) {
        const tiene = p.herramientas?.map(leerHerramienta);
        for (const req of reqHerr) {
            if (tiene && cumpleHerramienta(req, tiene)) continue;
            const actual = tiene?.find((h) => h.nombre === req.nombre);
            motivos.push({
                clave: "herramientas",
                texto: !tiene
                    ? `No sé si ${p.nombre} tiene ${textoHerramienta(req)}, que hace falta para compilar ${m.nombre}.`
                    : `Para compilar ${m.nombre} en esta neurona hace falta ${textoHerramienta(req)}${actual ? ` y hay ${textoHerramienta(actual)}` : " y no está instalado"}.`,
                bloquea: false,
                arreglo: arregloHerramienta(req, actual),
            });
        }
        if (motivos.some((x) => x.clave === "herramientas")) penalizaciones++;
    }

    // 7. RAM total (convención del catálogo: `ramMinGb` es la RAM TOTAL mínima del equipo).
    const ram = p.ramGb ?? (p.memoriaUnificada ? undefined : p.vramGb);
    if (typeof ram !== "number") {
        motivos.push({
            clave: "ram",
            texto: `No sé cuánta memoria tiene ${p.nombre}; ${m.nombre} pide ${numeroEs(m.ramMinGb)} GB.`,
            bloquea: false,
            arreglo: "Vuelve a detectar esta neurona.",
        });
        penalizaciones++;
    } else if (ram + TOLERANCIA_RAM_GB < m.ramMinGb) {
        fRam = 0;
        motivos.push({
            clave: "ram",
            texto: `${m.nombre} pide al menos ${numeroEs(m.ramMinGb)} GB de memoria y ${p.nombre} tiene ${numeroEs(ram)} GB.`,
            bloquea: true,
            arreglo: arregloConCuantizacion(
                p, m,
                "Usa una neurona con más memoria (o un servidor propio) o un modelo más pequeño de 1.58-bit.",
            ),
        });
    } else {
        const r = m.ramMinGb > 0 ? ram / m.ramMinGb : 4;
        fRam = r >= 2 ? 2 : r >= 1.25 ? 1 : 0;
    }

    // RAM libre ahora: no bloquea (cambia en minutos), pero avisa.
    const gb = tamanoModeloGb(m, ctx.tamanoConfirmadoGb);
    if (typeof p.ramLibreGb === "number") {
        const trabajo = streaming ? RESIDENTE_STREAMING_GB : gb !== null ? gb + 0.5 : m.ramMinGb * 0.6;
        if (p.ramLibreGb < trabajo) {
            motivos.push({
                clave: "ram-libre",
                texto: `Ahora quedan ${numeroEs(p.ramLibreGb)} GB libres y ${m.nombre} usa unos ${numeroEs(trabajo)} GB al cargarse: puede ir lento o tirar de la memoria de intercambio.`,
                bloquea: false,
                arreglo: "Cierra apps pesadas antes de cargarlo.",
            });
            penalizaciones++;
        }
    }

    // 8. VRAM: solo cuenta si la GPU tiene memoria propia.
    if (typeof m.vramMinGb === "number" && m.vramMinGb > 0 && !p.memoriaUnificada) {
        if (typeof p.vramGb === "number") {
            if (p.vramGb + TOLERANCIA_RAM_GB < m.vramMinGb) {
                motivos.push({
                    clave: "vram",
                    texto: `${m.nombre} pide ${numeroEs(m.vramMinGb)} GB de memoria de vídeo y ${p.nombre} tiene ${numeroEs(p.vramGb)} GB.`,
                    bloquea: true,
                    arreglo: arregloConCuantizacion(
                        p, m,
                        "Usa una GPU con más memoria o una versión más pequeña del modelo.",
                    ),
                });
            }
        } else if (p.tipo === "cpu") {
            motivos.push({
                clave: "vram",
                texto: `${m.nombre} necesita una GPU con ${numeroEs(m.vramMinGb)} GB de memoria de vídeo y ${p.nombre} es un procesador sin GPU.`,
                bloquea: true,
                arreglo: "Elige la GPU de esta neurona o una neurona con GPU.",
            });
        } else {
            motivos.push({
                clave: "vram",
                texto: `No sé cuánta memoria de vídeo tiene ${p.nombre}; ${m.nombre} pide ${numeroEs(m.vramMinGb)} GB.`,
                bloquea: false,
            });
            penalizaciones++;
        }
    }

    // 9. Disco: preguntar antes de asumir el tamaño.
    const necesario = espacioNecesarioGb(m, ctx.tamanoConfirmadoGb);
    if (necesario === null) {
        preguntar = true;
        motivos.push({
            clave: "disco-desconocido",
            texto: `No sé cuánto ocupa ${m.nombre}: depende de la variante. Dime el tamaño antes de reservarle sitio.`,
            bloquea: false,
            arreglo: "Confirma el tamaño en «Preguntas».",
        });
    } else if (typeof a.libreGb !== "number") {
        motivos.push({
            clave: "disco-libre",
            texto: `No sé cuánto espacio queda en «${a.etiqueta}»; ${m.nombre} necesita ${tamanoEs(necesario)}.`,
            bloquea: false,
            arreglo: "Vuelve a detectar el almacén o indica su espacio libre a mano.",
        });
        penalizaciones++;
    } else if (!cabeEn(a, necesario)) {
        fDisco = 0;
        const falta = Math.ceil((necesario + MARGEN_DISCO_GB - a.libreGb) * 10) / 10;
        const externoGb = Math.ceil(necesario + MARGEN_DISCO_GB);
        const rapido = streaming
            ? ` rápido (USB-C de 10 Gb/s o Thunderbolt, lectura de ${m.almacenamiento.lecturaMinMBs ?? 800} MB/s o más)`
            : "";
        const sePuedeLiberar = typeof a.totalGb !== "number" || a.totalGb >= necesario + MARGEN_DISCO_GB;
        const liberar = sePuedeLiberar ? `Libera ${numeroEs(falta)} GB en «${a.etiqueta}»` : "";
        let arreglo: string;
        if (a.tipo === "neurona-local") {
            const ext = `conecta a la neurona que lo procesa un disco externo${rapido} de al menos ${externoGb} GB`;
            arreglo = liberar ? `${liberar} o ${ext}.` : `${ext[0].toUpperCase()}${ext.slice(1)}.`;
        } else {
            const otro = `usa otro almacén con al menos ${externoGb} GB libres`;
            arreglo = liberar ? `${liberar} o ${otro}.` : `${otro[0].toUpperCase()}${otro.slice(1)}.`;
        }
        motivos.push({
            clave: "disco",
            texto: `${m.nombre} necesita ${tamanoEs(necesario)} (más ${MARGEN_DISCO_GB} GB de margen) y en «${a.etiqueta}» quedan ${numeroEs(a.libreGb)} GB libres.`,
            bloquea: true,
            arreglo,
        });
    } else {
        const resto = a.libreGb - necesario;
        fDisco = resto >= Math.max(10, 3 * necesario) ? 2 : resto >= 2 * MARGEN_DISCO_GB ? 1 : 0;
    }

    // 10. Pesos que tienen que estar en la neurona que procesa.
    const via = viaDeCarga(p, a, ctx);
    if (a.tipo === "navegador" && p.tipo !== "webgpu") {
        motivos.push({
            clave: "almacen-navegador",
            texto: `Lo guardado en el navegador («${a.etiqueta}») solo lo leen los modelos que corren en el navegador.`,
            bloquea: true,
            arreglo: "Guárdalo en el disco de la neurona o en un disco externo.",
        });
    }
    if (streaming || m.almacenamiento.soloLocal) {
        const mismaNeurona = !!a.neuronaId && a.neuronaId === p.neuronaId;
        const tipoLocal = a.tipo === "neurona-local" || a.tipo === "disco-externo" || (a.tipo === "navegador" && p.tipo === "webgpu" && !streaming);
        const porRed = a.conexion === "red" || a.conexion === "nube" || a.tipoDisco === "red";
        if (!mismaNeurona || !tipoLocal || porRed) {
            const donde = !a.neuronaId ? "fuera de tus neuronas" : !mismaNeurona ? "en otra neurona" : "en un medio de red";
            motivos.push({
                clave: "pesos-locales",
                texto: streaming
                    ? `${m.nombre} lee sus pesos del disco en cada token: tienen que estar en un disco de la misma neurona que lo procesa, nunca en la nube ni por red, y «${a.etiqueta}» está ${donde}.`
                    : `${m.nombre} necesita sus pesos en la misma neurona que lo procesa (no se cargan por red) y «${a.etiqueta}» está ${donde}.`,
                bloquea: true,
                arreglo: "Conecta el disco a la neurona que lo procesa o elige un almacén suyo (disco interno o externo por USB-C o Thunderbolt).",
            });
        } else if (streaming) {
            // 11. Velocidad de lectura del disco (solo pesa si se lee en cada token).
            const min = m.almacenamiento.lecturaMinMBs;
            const lento = a.tipoDisco === "hdd" || a.tipoDisco === "sd";
            if (typeof a.lecturaMBs === "number" && typeof min === "number") {
                if (a.lecturaMBs < min) {
                    motivos.push({
                        clave: "lectura",
                        texto: `«${a.etiqueta}» lee a ${Math.round(a.lecturaMBs)} MB/s y ${m.nombre} necesita ${min} MB/s o más.`,
                        bloquea: true,
                        arreglo: "Usa el disco interno o un SSD por USB-C de 10 Gb/s o Thunderbolt.",
                    });
                }
            } else if (lento) {
                motivos.push({
                    clave: "lectura",
                    texto: `«${a.etiqueta}» es un ${a.tipoDisco === "hdd" ? "disco duro mecánico" : "tarjeta SD"}: demasiado lento para leer pesos en cada token.`,
                    bloquea: true,
                    arreglo: "Usa el disco interno o un SSD por USB-C de 10 Gb/s o Thunderbolt.",
                });
            } else if (typeof min === "number") {
                const interno = a.tipo === "neurona-local" || a.conexion === "interna";
                if (interno && (a.tipoDisco === "nvme" || a.tipoDisco === "ssd")) {
                    motivos.push({
                        clave: "lectura",
                        texto: `Supongo que el disco interno (${a.tipoDisco === "nvme" ? "NVMe" : "SSD"}) lee a más de ${min} MB/s; no está medido.`,
                        bloquea: false,
                    });
                } else {
                    motivos.push({
                        clave: "lectura",
                        texto: `No sé a qué velocidad lee «${a.etiqueta}»; ${m.nombre} necesita ${min} MB/s o más.`,
                        bloquea: false,
                        arreglo: "Mide el disco desde «Recursos de IA» o usa uno por USB-C de 10 Gb/s o Thunderbolt.",
                    });
                    penalizaciones++;
                }
            }
        }
    }

    // 12. Antena: nunca transporta pesos (2 kB/s).
    if (via === "antena") {
        const dias = gb !== null ? duracionEs((gb * 1024) / VIA_REFERENCIA.antena.mbs) : "semanas";
        motivos.push({
            clave: "antena",
            texto: `Por antena (LoRa/radio) no viajan pesos de modelos: ${gb !== null ? `${numeroEs(gb)} GB tardarían unos ${dias}` : "tardarían semanas"}.`,
            bloquea: true,
            arreglo: "Guarda el modelo en un disco de la neurona que lo procesa, o llega por la malla local o la red de StarSeed.",
        });
    } else if (p.via === "antena") {
        motivos.push({
            clave: "via",
            texto: `A ${p.nombre} se llega por antena: sirve para decisiones y mensajes cortos, no para conversar.`,
            bloquea: false,
        });
        penalizaciones++;
    }

    // 13. Tiempo de carga (carga completa o mmap): tamaño / lo más lento entre la vía y el disco.
    let cargaSegundos: number | undefined;
    if (!streaming && gb !== null && via !== "antena") {
        const disco = a.lecturaMBs ?? LECTURA_TIPICA[a.tipoDisco ?? "desconocido"];
        const mbs = via === "local" ? disco : Math.min(VIA_REFERENCIA[via].mbs, a.lecturaMBs ?? Infinity);
        cargaSegundos = Math.round((gb * 1024) / Math.max(0.001, mbs));
        fCarga = cargaSegundos <= CARGA_RAPIDA_S ? 2 : cargaSegundos <= CARGA_LENTA_S ? 1 : 0;
        if (cargaSegundos > CARGA_LENTA_S) {
            motivos.push({
                clave: "carga",
                texto: `Tardaría unos ${duracionEs(cargaSegundos)} en cargar por ${VIA_REFERENCIA[via].nombre.toLowerCase()}.`,
                bloquea: false,
                arreglo: "Cópialo a un disco de la neurona que lo procesa: cargará en segundos.",
            });
        }
    }

    // 14. Privacidad: lo personal no sale a un almacén ni a un procesador ajeno sin elegirlo.
    if (ctx.privado) {
        if (!a.privado) {
            motivos.push({
                clave: "privacidad",
                texto: `Este espacio es privado y «${a.etiqueta}» no lo es: lo personal no sale de tu cuenta sin que lo elijas.`,
                bloquea: true,
                arreglo: "Elige un almacén privado de tu cuenta (una neurona, la Biblioteca o un disco tuyo).",
            });
        }
        const propio = ctx.propio ?? (p.tipo !== "servidor" && p.via !== "internet");
        if (!propio) {
            motivos.push({
                clave: "privacidad",
                texto: `${p.nombre} no es de tu cuenta: lo privado solo se procesa en tus neuronas o en tu servidor propio.`,
                bloquea: true,
                arreglo: "Procesa en una neurona tuya o marca este espacio como público.",
            });
        }
    }

    // 15. Disponibilidad: no bloquea (vuelve en minutos), pero baja el nivel y se dice.
    if (!p.disponible) {
        motivos.push({
            clave: "procesador-no-disponible",
            texto: `${p.nombre} no está disponible ahora (apagado o sin conexión).`,
            bloquea: false,
            arreglo: "Enciéndelo o conéctalo; mientras, sirve la siguiente opción.",
        });
        penalizaciones++;
    }
    if (!a.disponible) {
        motivos.push({
            clave: "almacen-no-disponible",
            texto: `«${a.etiqueta}» no está disponible ahora (desconectado o sin red).`,
            bloquea: false,
            arreglo: "Conéctalo de nuevo; mientras, sirve la siguiente opción.",
        });
        penalizaciones++;
    }

    // 16. Velocidad estimada (texto).
    const tokSEstimado = estimarTokS(m, p);
    if (typeof tokSEstimado === "number") fVel = tokSEstimado >= TOKS_COMODO ? 2 : tokSEstimado >= TOKS_USABLE ? 1 : 0;

    // Nivel.
    const bloqueos = motivos.filter((x) => x.bloquea);
    let nivel: NivelCompat;
    if (bloqueos.some((x) => !CLAVES_NO_CABE.has(x.clave))) nivel = "incompatible";
    else if (bloqueos.length) nivel = "no-cabe";
    else if (preguntar) nivel = "preguntar";
    else {
        const escalon = Math.max(0, Math.min(fRam, fDisco, fVel, fCarga) - penalizaciones);
        nivel = escalon >= 2 ? "optimo" : escalon >= 1 ? "bueno" : "justo";
    }

    // Puntuación 0-100: nivel + 1.58-bit + local > malla > red + holgura + velocidad + potencia.
    // Las bases están calculadas para que el mejor caso sume 100 sin recortar: recortar empataría
    // a un 1.58-bit con un 4-bit en 100 y se perdería el orden.
    const base = { optimo: 42, bueno: 34, justo: 26, preguntar: 18, "no-cabe": 0, incompatible: 0 }[nivel];
    // Pesos por capacidad (topes): razón 6 velocidad / 10 potencia; decisión 10 / 2; resto 10 / 6.
    const [topeVel, topePot, pesoPot] = ctx.capacidad === "razon" ? [6, 10, 2.5] : ctx.capacidad === "decision" ? [10, 2, 0.5] : [10, 6, 1.5];
    const velocidad = typeof tokSEstimado === "number" ? Math.min(topeVel, Math.log2(1 + tokSEstimado) * 2) : topeVel / 2;
    const potencia = Math.min(topePot, Math.log2(1 + potenciaB(m)) * pesoPot);
    let puntos =
        base +
        bonoBits(m.bits) +
        BONO_VIA[p.via] +
        fRam * 4 +
        (preguntar ? 1 : fDisco) * 3 +
        velocidad +
        potencia +
        BONO_ESTADO[m.estado] +
        (ctx.instalado ? 5 : 0) -
        penalizaciones * 5 -
        (runtimePorInstalar && !ctx.instalado ? 2 : 0);
    if (nivel === "incompatible") puntos = 0;
    else if (nivel === "no-cabe") puntos = Math.min(20, puntos * 0.3);
    const puntuacion = Math.max(0, Math.min(100, Math.round(puntos)));

    return { nivel, puntuacion, motivos, tokSEstimado, cargaSegundos };
}
