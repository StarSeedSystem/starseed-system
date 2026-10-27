"use client";

/**
 * Piezas compartidas de «Recursos de IA» (panel, constelación, selector de medio y resumen).
 * SOP: `architecture/recursos-ia-neurona.md`. Lenguaje visual Crystal Liquid Glass (las clases
 * vienen de `s158/shared.tsx`) con la paleta Trinity: Zenith (IA/guía), Horizon (óptimo),
 * Logic (aviso/control) y Anchor (bloqueo). Nada de `node:*`: esto va al navegador.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
    Brain,
    Cloud,
    Cpu,
    Globe,
    HardDrive,
    Library,
    Microchip,
    Server,
    Usb,
    Zap,
    type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { verificar, type ContextoCompat } from "@/lib/recursos-ia/compatibilidad";
import { cuantizacionesPara, type DispositivoHF } from "@/lib/recursos-ia/cuantizacion-hf";
import { detectarInventario } from "@/lib/recursos-ia/deteccion";
import {
    ORDEN_NIVEL,
    VIA_REFERENCIA,
    type Acelerador,
    type Alcance,
    type Compatibilidad,
    type InventarioRecursos,
    type MedioAlmacen,
    type NivelCompat,
    type Procesador,
    type RequisitosModelo,
    type TipoAlmacen,
    type TipoProcesador,
    type Topologia,
    type Via,
} from "@/lib/recursos-ia/tipos";

/* ── Paleta Trinity ────────────────────────────────────────────────────────── */

export const TRINITY = {
    zenith: "#007FFF",
    horizon: "#39FF14",
    horizonSuave: "#10B981",
    logic: "#FFBF00",
    logicSuave: "#D4AF37",
    anchor: "#DC143C",
} as const;

/** Alcance por defecto: el perfil propio, privado. */
export const ALCANCE_PROPIO: Alcance = { tipo: "perfil", id: "propio", visibilidad: "privada" };

/* ── Niveles de compatibilidad ─────────────────────────────────────────────── */

export const NOMBRE_NIVEL: Record<NivelCompat, string> = {
    optimo: "Óptimo",
    bueno: "Bueno",
    justo: "Justo",
    preguntar: "Falta un dato",
    "no-cabe": "No cabe",
    incompatible: "Incompatible",
};

export const TONO_NIVEL: Record<NivelCompat, string> = {
    optimo: "border-[#39FF14]/45 bg-[#10B981]/15 text-emerald-100",
    bueno: "border-[#007FFF]/55 bg-[#007FFF]/15 text-sky-100",
    justo: "border-[#FFBF00]/45 bg-[#FFBF00]/10 text-amber-100",
    preguntar: "border-[#FFBF00]/45 bg-[#FFBF00]/10 text-amber-100",
    "no-cabe": "border-[#DC143C]/60 bg-[#DC143C]/15 text-rose-100",
    incompatible: "border-[#DC143C]/60 bg-[#DC143C]/15 text-rose-100",
};

export function NivelBadge({ nivel, className }: { nivel: NivelCompat; className?: string }) {
    return (
        <span
            data-nivel={nivel}
            className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold leading-none",
                TONO_NIVEL[nivel],
                className,
            )}
        >
            {nivel === "preguntar" && <span aria-hidden="true">?</span>}
            {NOMBRE_NIVEL[nivel]}
        </span>
    );
}

/** Insignia destacada del ternario: 1.58-bit va primero en todo el OS. */
export function Badge158({ className }: { className?: string }) {
    return (
        <span
            title="Pesos ternarios (−1, 0, +1): lo más eficiente que corre en local"
            className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border border-[#39FF14]/60 bg-[#39FF14]/10 px-1.5 py-0.5 font-code text-[9px] font-semibold leading-none text-[#39FF14] shadow-[0_0_8px_-2px_#39FF14]",
                className,
            )}
        >
            1.58-bit
        </span>
    );
}

export function BitsBadge({ bits }: { bits: number }) {
    if (bits === 1.58) return <Badge158 />;
    return (
        <span className="inline-flex shrink-0 items-center rounded-full border border-white/15 bg-white/[0.04] px-1.5 py-0.5 font-code text-[9px] leading-none text-white/75">
            {bits}-bit
        </span>
    );
}

export const TONO_FUENTE: Record<"detectado" | "declarado" | "estimado", string> = {
    detectado: "border-[#10B981]/40 bg-[#10B981]/10 text-emerald-100",
    declarado: "border-[#007FFF]/45 bg-[#007FFF]/10 text-sky-100",
    estimado: "border-[#FFBF00]/40 bg-[#FFBF00]/10 text-amber-100",
};

export function FuenteBadge({ fuente }: { fuente: "detectado" | "declarado" | "estimado" }) {
    return (
        <span className={cn("inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[9px] leading-none", TONO_FUENTE[fuente])}>
            {fuente}
        </span>
    );
}

/* ── Formatos ──────────────────────────────────────────────────────────────── */

export function fmtNum(n: number, dec = 1): string {
    return n.toLocaleString("es", { maximumFractionDigits: dec });
}

export function fmtGb(gb?: number | null): string {
    if (typeof gb !== "number" || !Number.isFinite(gb)) return "—";
    if (gb >= 1000) return `${fmtNum(gb / 1000)} TB`;
    if (gb > 0 && gb < 1) return `${fmtNum(gb * 1024, 0)} MB`;
    return `${fmtNum(gb)} GB`;
}

/** «9,2 GB libres de 228 GB» (o lo que se sepa). */
export function fmtLibre(a: Pick<MedioAlmacen, "libreGb" | "totalGb">): string {
    if (typeof a.libreGb === "number" && typeof a.totalGb === "number") return `${fmtGb(a.libreGb)} libres de ${fmtGb(a.totalGb)}`;
    if (typeof a.libreGb === "number") return `${fmtGb(a.libreGb)} libres`;
    if (typeof a.totalGb === "number") return `${fmtGb(a.totalGb)} en total`;
    return "capacidad sin medir";
}

/** Fracción ocupada (0–1) o null si no se sabe. */
export function fraccionOcupada(a: Pick<MedioAlmacen, "libreGb" | "totalGb">): number | null {
    if (typeof a.libreGb !== "number" || typeof a.totalGb !== "number" || a.totalGb <= 0) return null;
    return Math.max(0, Math.min(1, 1 - a.libreGb / a.totalGb));
}

/** Color del arco de llenado: verde con holgura, ámbar justo, carmesí casi lleno. */
export function colorLlenado(a: Pick<MedioAlmacen, "libreGb" | "totalGb">): string {
    const ocupada = fraccionOcupada(a);
    if (ocupada === null) return "rgba(255,255,255,0.35)";
    const libre = 1 - ocupada;
    if (libre < 0.05) return TRINITY.anchor;
    if (libre < 0.15) return TRINITY.logic;
    return TRINITY.horizonSuave;
}

export function tonoBarra(a: Pick<MedioAlmacen, "libreGb" | "totalGb">): string {
    const c = colorLlenado(a);
    if (c === TRINITY.anchor) return "bg-[#DC143C]/80";
    if (c === TRINITY.logic) return "bg-[#FFBF00]/80";
    return "bg-[#10B981]/80";
}

/* ── Nombres e iconos ──────────────────────────────────────────────────────── */

export const NOMBRE_TIPO_ALMACEN: Record<TipoAlmacen, string> = {
    "neurona-local": "Disco interno",
    navegador: "Navegador",
    biblioteca: "Biblioteca",
    "carpeta-cerebro": "Carpeta de cerebro",
    "disco-externo": "Disco externo",
    "servidor-externo": "Servidor de almacenamiento",
    nube: "Nube",
};

export const ICONO_ALMACEN: Record<TipoAlmacen, LucideIcon> = {
    "neurona-local": HardDrive,
    navegador: Globe,
    biblioteca: Library,
    "carpeta-cerebro": Brain,
    "disco-externo": Usb,
    "servidor-externo": Server,
    nube: Cloud,
};

export const NOMBRE_TIPO_PROCESADOR: Record<TipoProcesador, string> = {
    cpu: "CPU",
    gpu: "GPU",
    npu: "NPU",
    webgpu: "WebGPU",
    servidor: "Servidor",
};

export const ICONO_PROCESADOR: Record<TipoProcesador, LucideIcon> = {
    cpu: Cpu,
    gpu: Microchip,
    npu: Zap,
    webgpu: Globe,
    servidor: Server,
};

/** Letra del procesador dentro de su nodo de la constelación. */
export const LETRA_PROCESADOR: Record<TipoProcesador, string> = { cpu: "C", gpu: "G", npu: "N", webgpu: "W", servidor: "S" };

/**
 * Dispositivo de la tabla de cuantización de transformers (`cuantizacion-hf.ts`) equivalente a un
 * procesador detectado: cuda, rocm o metal por sus aceleradores; el resto, cpu. En un navegador
 * transformers no corre: ahí no hay método que sugerir (devuelve `undefined`).
 */
export function dispositivoHFDe(p: Procesador): DispositivoHF | undefined {
    if (p.tipo === "webgpu") return undefined;
    if (p.aceleradores.includes("cuda")) return "cuda";
    if (p.aceleradores.includes("rocm")) return "rocm";
    if (p.aceleradores.includes("metal") || p.aceleradores.includes("metal4")) return "metal";
    return "cpu";
}

/** Métodos aptos en este procesador según la tabla (ok sin marca, parcial con «parcial»); solo nombres. */
export function textoCuantizaHF(p: Procesador): string {
    const d = dispositivoHFDe(p);
    if (!d) return "";
    return cuantizacionesPara(d)
        .map((m) => (m.soporte[d] === "parcial" ? `${m.nombre} (parcial)` : m.nombre))
        .join(" · ");
}

export function nombreVia(v: Via): string {
    return VIA_REFERENCIA[v]?.nombre ?? v;
}

/** Trazo de cada vía en la constelación y en la leyenda. */
export const TRAZO_VIA: Record<Via, { color: string; ancho: number; guiones?: string }> = {
    local: { color: "rgba(255,255,255,0.4)", ancho: 1.4 },
    "malla-local": { color: TRINITY.zenith, ancho: 1.8 },
    "red-starseed": { color: TRINITY.zenith, ancho: 1.4, guiones: "7 5" },
    antena: { color: TRINITY.logic, ancho: 1, guiones: "1.5 4" },
    internet: { color: "rgba(255,255,255,0.28)", ancho: 1.2 },
};

export const NOMBRE_ACELERADOR: Record<Acelerador, string> = {
    metal: "Metal",
    metal4: "Metal 4",
    cuda: "CUDA (NVIDIA)",
    rocm: "ROCm (AMD)",
    vulkan: "Vulkan",
    webgpu: "WebGPU",
    "wasm-simd": "WASM SIMD",
    neon: "NEON",
    avx2: "AVX2",
    avx512: "AVX-512",
    coreml: "Core ML",
    ane: "Neural Engine",
};

export const TEXTO_TOPOLOGIA: Record<Topologia, { que: string; cuando: string }> = {
    "cada-neurona": {
        que: "Cada neurona usa sus propios modelos y su propio procesador.",
        cuando: "Conviene con una sola neurona o si todas son capaces por sí solas.",
    },
    "servidor-propio": {
        que: "Una de tus neuronas procesa la IA de todas, por la malla local, la red de StarSeed o tus antenas.",
        cuando: "Conviene si una neurona es claramente más capaz y suele estar encendida.",
    },
    "almacen-externo": {
        que: "Los modelos viven en un disco o servidor externo y procesa la neurona donde lo conectas.",
        cuando: "Conviene con poco disco interno y un almacenamiento externo rápido.",
    },
    fragmentada: {
        que: "Cada capacidad va a la neurona o al servidor que mejor la hace.",
        cuando: "Conviene con varias neuronas de fuerzas distintas (una con GPU, otra con mucho disco).",
    },
    comunal: {
        que: "Usa servidores compartidos del grupo o la comunidad, públicos o privados.",
        cuando: "Conviene en el alcance de un grupo o una comunidad.",
    },
};

/* ── Requisitos legibles de un modelo ──────────────────────────────────────── */

function soLegible(s: string): string {
    const m = /^(macos|linux|windows|android|ios)\s*>=\s*([\d.]+)$/i.exec(s.trim());
    if (m) {
        const nombre = { macos: "macOS", linux: "Linux", windows: "Windows", android: "Android", ios: "iOS" }[m[1].toLowerCase()] ?? m[1];
        return `${nombre} ${m[2]} o superior`;
    }
    if (/^navegador$/i.test(s)) return "cualquier navegador moderno";
    return s;
}

function herramientaLegible(h: string): string {
    const m = /^([a-z]+)-([\d.]+)$/i.exec(h);
    if (!m) return h;
    const nombre = { swift: "Swift", xcode: "Xcode", python: "Python", node: "Node", cmake: "CMake", rust: "Rust" }[m[1].toLowerCase()] ?? m[1];
    return `${nombre} ${m[2]}`;
}

/** Frases cortas, en palabras de la persona, con lo que el modelo necesita. */
export function requisitosLegibles(m: RequisitosModelo): string[] {
    const out: string[] = [];
    if (m.so?.length) out.push(`Sistema: ${m.so.map(soLegible).join(" · ")}`);
    if (m.arquitecturas?.length) {
        const arq = m.arquitecturas.map((a) => (a === "arm64" ? "ARM64 (Apple Silicon y similares)" : a === "x86_64" ? "x86-64" : a === "wasm" ? "navegador (WASM)" : a));
        out.push(`Procesador: ${arq.join(" · ")}`);
    }
    if (m.aceleradoresRequeridos?.length) out.push(`Acelerador: ${m.aceleradoresRequeridos.map((a) => NOMBRE_ACELERADOR[a] ?? a).join(" o ")}`);
    if (m.herramientasRequeridas?.length) out.push(`Se compila en la neurona con ${m.herramientasRequeridas.map(herramientaLegible).join(" y ")}`);
    out.push(`RAM mínima ${fmtGb(m.ramMinGb)}${typeof m.vramMinGb === "number" ? ` · VRAM ${fmtGb(m.vramMinGb)}` : ""}`);
    if (m.almacenamiento.modo === "streaming-ssd") {
        out.push(
            `Lee los pesos del SSD en cada token: solo disco local rápido${typeof m.almacenamiento.lecturaMinMBs === "number" ? ` (≥ ${fmtNum(m.almacenamiento.lecturaMinMBs, 0)} MB/s)` : ""}, nunca nube ni red`,
        );
    } else if (m.almacenamiento.modo === "mmap") {
        out.push("Mapea los pesos desde el disco (arranca rápido, usa la RAM que necesita)");
    } else {
        out.push("Carga el modelo entero en memoria");
    }
    if (m.almacenamiento.soloLocal && m.almacenamiento.modo !== "streaming-ssd") out.push("Los pesos tienen que estar en la neurona que procesa");
    if (m.servidor) out.push(`Levanta un servidor ${m.servidor.protocolo === "openai" ? "compatible con OpenAI" : "propio"} solo en esta máquina`);
    return out;
}

/** Tamaño que se conoce de un modelo: el confirmado por la persona o el del catálogo. */
export function tamanoConocido(m: RequisitosModelo, confirmados: Record<string, number>): number | null {
    const c = confirmados[m.id];
    if (typeof c === "number" && Number.isFinite(c)) return c;
    return typeof m.disco.gb === "number" ? m.disco.gb : null;
}

/* ── Inventario ────────────────────────────────────────────────────────────── */

export function todosLosProcesadores(inv: InventarioRecursos): Procesador[] {
    return [...inv.neuronas.flatMap((n) => n.procesadores), ...inv.procesadoresSueltos];
}

export function todosLosAlmacenes(inv: InventarioRecursos): MedioAlmacen[] {
    return [...inv.neuronas.flatMap((n) => n.almacenes), ...inv.almacenesSueltos];
}

export function nombreNeurona(inv: InventarioRecursos | null, id?: string): string {
    if (!inv || !id) return "";
    return inv.neuronas.find((n) => n.id === id)?.nombre ?? "";
}

/**
 * El inventario con los almacenes declarados de AHORA: quita los declarados que ya no están y
 * añade los nuevos (sin duplicar los que la detección ya colocó en su neurona). Pura.
 */
export function conDeclarados(inv: InventarioRecursos, declarados: MedioAlmacen[]): InventarioRecursos {
    const vivos = new Set(declarados.map((d) => d.id));
    const fuera = (a: MedioAlmacen) => a.fuente !== "declarado" || vivos.has(a.id);
    const neuronas = inv.neuronas.map((n) => ({ ...n, almacenes: n.almacenes.filter(fuera) }));
    const sueltos = inv.almacenesSueltos.filter(fuera);
    const ya = new Set([...neuronas.flatMap((n) => n.almacenes), ...sueltos].map((a) => a.id));
    return { ...inv, neuronas, almacenesSueltos: [...sueltos, ...declarados.filter((d) => !ya.has(d.id))] };
}

/** Vía por la que un procesador lee un almacén (aproximada, para `verificar`). */
export function viaEntre(p: Procesador, a: MedioAlmacen): Via {
    if (a.neuronaId && a.neuronaId === p.neuronaId) return "local";
    if (!a.neuronaId) return a.via;
    if (a.via === "local") return p.via === "local" ? "malla-local" : p.via;
    return a.via;
}

/** Llama a la lógica (que escriben otros agentes) sin dejar que un fallo tumbe la interfaz. */
export function seguro<T>(fn: () => T, respaldo: T): T {
    try {
        return fn();
    } catch {
        return respaldo;
    }
}

export interface Encaje {
    procesador: Procesador;
    almacen: MedioAlmacen;
    compat: Compatibilidad;
}

export function mejorQue(a: Compatibilidad, b: Compatibilidad): boolean {
    const d = ORDEN_NIVEL[a.nivel] - ORDEN_NIVEL[b.nivel];
    return d !== 0 ? d < 0 : a.puntuacion > b.puntuacion;
}

/** El mejor encaje de un modelo entre todos los procesadores × almacenes del inventario. */
export function mejorEncaje(
    m: RequisitosModelo,
    procesadores: Procesador[],
    almacenes: MedioAlmacen[],
    ctx: Omit<ContextoCompat, "viaAlmacen"> = {},
): Encaje | null {
    let mejor: Encaje | null = null;
    for (const p of procesadores) {
        if (!p.disponible) continue;
        for (const a of almacenes) {
            if (!a.disponible) continue;
            const compat = seguro(() => verificar(m, p, a, { ...ctx, viaAlmacen: viaEntre(p, a) }), null);
            if (!compat) continue;
            if (!mejor || mejorQue(compat, mejor.compat)) mejor = { procesador: p, almacen: a, compat };
        }
    }
    return mejor;
}

/** Inventario en vivo: detecta al montar (o al abrirse) y se rehace con «Volver a detectar». */
export function useInventarioRecursos(declarados: MedioAlmacen[], activo = true) {
    const [base, setBase] = useState<InventarioRecursos | null>(null);
    const [detectando, setDetectando] = useState(false);
    const [error, setError] = useState("");
    const declaradosRef = useRef(declarados);
    declaradosRef.current = declarados;
    const vivo = useRef(true);

    const detectar = useCallback(async () => {
        setDetectando(true);
        try {
            // Sin forzar `conServidor`: la detección solo pregunta a la máquina por dentro en localhost.
            const inv = await detectarInventario({ declarados: declaradosRef.current });
            if (vivo.current) {
                setBase(inv);
                setError("");
            }
        } catch (e) {
            if (vivo.current) setError(e instanceof Error ? e.message : String(e));
        } finally {
            if (vivo.current) setDetectando(false);
        }
    }, []);

    useEffect(() => {
        vivo.current = true;
        if (activo) void detectar();
        return () => {
            vivo.current = false;
        };
    }, [activo, detectar]);

    const inv = useMemo(() => (base ? conDeclarados(base, declarados) : null), [base, declarados]);
    return { inv, detectando, error, detectar };
}

/* ── Piezas de presentación ────────────────────────────────────────────────── */

/** Texto en una línea con «…» y el resto al pasar el cursor. */
export function Linea({ children, titulo, className }: { children: ReactNode; titulo?: string; className?: string }) {
    return (
        <span className={cn("block min-w-0 truncate", className)} title={titulo ?? (typeof children === "string" ? children : undefined)}>
            {children}
        </span>
    );
}

export const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007FFF]/70 focus-visible:ring-offset-1 focus-visible:ring-offset-black";
