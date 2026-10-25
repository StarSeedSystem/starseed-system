// Apertura de una app en la malla — conector del lanzador (architecture/apps-en-la-malla.md §5 y §12).
// Módulo PURO: sin node:*, sin red y sin reloj. La oferta de esta neurona y el plan de la bolsa
// llegan inyectados; el catálogo dice qué admite la app (`StarseedApp.ejecucion`/`requisitos`).

import type { ModoEjecucion } from "../../../lib/recursos/modos-app";
import { comoAbrir, type DecisionApertura, type PlanApertura } from "../../../lib/recursos/modos-app";
import type { OfertaNeurona } from "../../../lib/recursos/oferta";
import type { StarseedApp } from "./launcher-types";

/** Etiqueta legible de cada modo para el menú «Abrir en…» (§12). */
export const ETIQUETA_MODO: Record<ModoEjecucion, string> = {
    local: "esta neurona",
    "por-bandas": "por bandas (volumen de la malla)",
    montada: "montando su volumen",
    transmitida: "otra neurona (ventana transmitida)",
    ramificada: "aquí, con el cálculo repartido",
};

/**
 * Lo que esta neurona aporta al abrir una app. Sin `ofertaLocal` (o sin medida) NO se
 * juzga nada: la app se abre como hasta hoy — lo no medido nunca se inventa (§3).
 */
export interface FuenteApertura {
    /** Oferta prestable de esta neurona; `undefined` = sin medir. */
    ofertaLocal?: () => OfertaNeurona | undefined;
    /** Lo que la red ofrece (fuentes de volumen, otra neurona con la app…); sin dato, vacío. */
    planApertura?: () => PlanApertura | undefined;
}

/**
 * Oferta de esta neurona a partir de lo que el navegador mide. La RAM es la cota de
 * `deviceMemory` (topa en 8 GB: sirve para el suelo, nunca para prometer); sin cota
 * queda 0 (sin medir) y sin WebGPU no hay GPU. Nunca se anuncian discos ni rutas (§3).
 */
export function ofertaDeCapacidades(caps: {
    memoryGb?: number | null;
    nucleos?: number | null;
    webgpu?: boolean;
}): OfertaNeurona {
    const ramCotaMb = typeof caps.memoryGb === "number" && caps.memoryGb > 0 ? Math.round(caps.memoryGb * 1024) : 0;
    return {
        nodoId: "esta-neurona",
        cuentaId: "",
        medio: "navegador",
        computo: {
            nucleos: typeof caps.nucleos === "number" && caps.nucleos > 0 ? caps.nucleos : 1,
            ramLibreMb: ramCotaMb,
            gpu: caps.webgpu === true,
            vramMb: undefined,
            motores: [],
        },
        almacen: { prestaMb: 0, volumenes: [] },
        apps: [],
        enlaces: {},
        energia: { enUso: false },
        presta: { cuenta: true, grupos: [], publico: false, topes: { cpuPct: 100, ramMb: 0, discoMb: 0, soloCargando: false } },
        t: 0,
    };
}

/** El veredicto merece nota al abrir: solo un modo ajeno o el suelo honesto (§4 regla 7). Nadie abre local sin más. */
export function avisoDeApertura(decision: DecisionApertura | undefined): string | undefined {
    if (!decision) return undefined;
    if (decision.modo !== "local") return decision.motivo;
    return decision.motivo.startsWith("Suelo") ? decision.motivo : undefined;
}

/**
 * decidirApertura — aplica la regla del §5 con `comoAbrir` al abrir una app del lanzador.
 * Sin campo `ejecucion` ni `requisitos` no se juzga (como hoy); con modos declarados pero
 * sin oferta medida tampoco. El suelo nunca cierra la app: se abre como se pueda y dice por qué.
 */
export function decidirApertura(app: StarseedApp, fuentes?: FuenteApertura): DecisionApertura | undefined {
    if (!app.ejecucion && !app.requisitos) return undefined;
    const oferta = fuentes?.ofertaLocal?.();
    if (!oferta) return undefined;
    return comoAbrir(app, oferta, fuentes?.planApertura?.() ?? {});
}
