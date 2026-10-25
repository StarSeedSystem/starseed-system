// ════════════════════════════════════════════════════════════════
// Modos de apertura de una app en la malla (apps-en-la-malla.md §5)
// ----------------------------------------------------------------
// Puro: decide POR QUÉ camino se abre una app en una neurona, con el
// plan de la bolsa como recurso para «transmitida» y «ramificada».
// Sin red, sin disco, sin procesos ni reloj. El motivo siempre es
// legible y explica la elección.
// ════════════════════════════════════════════════════════════════

import type { StarseedApp, ModoEjecucionApp } from "../../components/dashboard/apps/launcher-types";
import type { OfertaNeurona } from "./oferta";

/** Tope de latencia medida para usar una app transmitida en tiempo real (§4 regla 2). */
export const LATENCIA_TOPE_MS = 100;

/** Plan con el que la bolsa aporta recursos a esta apertura (§4). */
export interface PlanAbrir {
    /** Vecinos o servidores que tienen la app prestable, con su latencia MEDIDA. */
    anfitriones?: { nodoId: string; latenciaMs?: number }[];
    /** Neurona elegida por la bolsa para el cálculo ramificado. */
    calculo?: { nodoId: string };
}

/** Lo que falta en la neurona para abrir la app en local (cada falta legible; null si no falta). */
export interface FaltasLocal {
    ram: string | null;
    gpu: string | null;
    motores: string | null;
    volumen: string | null;
}

/** Elección de modo con su destino y motivo legible (§5). */
export interface DecisionAbrir {
    modo: ModoEjecucionApp;
    destino: string;
    motivo: string;
}

/** Requisitos cuantificados de la app; lo no pedido es 0/[]/undefined. */
export function requisitosDe(app: StarseedApp) {
    const r = app.requisitos ?? {};
    return {
        ramMb: r.ramMb ?? 0,
        gpu: r.gpu === true,
        motores: r.motores ?? [],
        volumen: r.volumen,
    };
}

/** Modos que la app admite; sin campo declara solo «local» (contrato). */
export function modosDe(app: StarseedApp): ModoEjecucionApp[] {
    return app.ejecucion ?? ["local"];
}

// ── Lo que falta (§3: todo número medido) ────────────────────────
export function faltasLocal(app: StarseedApp, neurona: OfertaNeurona): FaltasLocal {
    const req = requisitosDe(app);
    const comp = neurona.computo;
    const faltasRam = req.ramMb > comp.ramLibreMb
        ? `faltan ${req.ramMb - comp.ramLibreMb} MB de RAM libre (${req.ramMb} pedidos y ${comp.ramLibreMb} libres)`
        : null;
    const faltaGpu = req.gpu && !comp.gpu ? "la app necesita GPU y la neurona no la ofrece" : null;
    const motoresQueFaltan = req.motores.filter(m => !comp.motores.includes(m));
    const faltanMotores = motoresQueFaltan.length > 0
        ? `falta el motor ${motoresQueFaltan.join(", ")}`
        : null;
    const faltaVolumen = req.volumen !== undefined && !neurona.almacen.volumenes.includes(req.volumen)
        ? `la neurona no guarda el volumen ${req.volumen}`
        : null;
    return { ram: faltasRam, gpu: faltaGpu, motores: faltanMotores, volumen: faltaVolumen };
}

function listar(faltas: FaltasLocal): string {
    const pedazo = [faltas.ram, faltas.gpu, faltas.motores, faltas.volumen].filter(v => v !== null);
    return pedazo.join("; ");
}

function anfitrionAlcanzable(plan: PlanAbrir): { nodoId: string; latenciaMs: number } | null {
    const alcancables = (plan.anfitriones ?? []).filter(
        (a): a is typeof a & { latenciaMs: number } =>
            a.latenciaMs !== undefined && a.latenciaMs <= LATENCIA_TOPE_MS
    );
    if (alcancables.length === 0) return null;
    alcancables.sort((a, b) => a.latenciaMs - b.latenciaMs);
    return alcancables[0];
}

/** Modo elegido para abrir la app en esta neurona, con destino y motivo (§5). */
export function comoAbrir(
    app: StarseedApp,
    neurona: OfertaNeurona,
    plan: PlanAbrir = {}
): DecisionAbrir {
    const modos = modosDe(app);
    const req = requisitosDe(app);
    const faltas = faltasLocal(app, neurona);
    const algoFalta = listar(faltas);
    const faltaSoloCalculo = !faltas.volumen && (faltas.ram !== null || faltas.gpu !== null || faltas.motores !== null);

    // Cabe en la neurona: local si la app lo admite; si no, su primer modo declarado.
    if (algoFalta === "") {
        if (modos.includes("local")) {
            return { modo: "local", destino: destinoLocal(app), motivo: "La neurona cumple los requisitos de la app: abre en local." };
        }
        const primero = modos[0];
        const destino = primero === "montada" && req.volumen ? req.volumen : destinoLocal(app);
        return { modo: primero, destino, motivo: "La neurona cumple los requisitos y la app se abre por su modo declarado." };
    }

    // Por bandas: es web/WASM con volumen; solo se baja lo que se usa, desde vecinos, Drive o el A1 (§5).
    if (modos.includes("por-bandas") && req.volumen !== undefined) {
        const aviso = faltas.volumen !== null
            ? " El volumen llega por la malla al caché del medio."
            : " Solo se baja lo que se usa desde el volumen.";
        return { modo: "por-bandas", destino: destinoLocal(app), motivo: `Es una app web/WASM con el volumen ${req.volumen}: se baja por bandas.${aviso}` };
    }

    // Transmitida: otra neurona la tiene prestada y la latencia MEDIDA sirve (§9; sin latencia medida no se usa).
    const anfitrion = anfitrionAlcanzable(plan);
    if (modos.includes("transmitida") && anfitrion !== null) {
        return { modo: "transmitida", destino: anfitrion.nodoId, motivo: `Sale de otra neurona: ventana en vídeo con latencia medida de ${anfitrion.latenciaMs} ms (tope ${LATENCIA_TOPE_MS} ms).` };
    }

    // Montada: app nativa que vive fuera del disco; el volumen se ve como un disco local (§7).
    if (modos.includes("montada") && req.volumen !== undefined) {
        return { modo: "montada", destino: req.volumen, motivo: `Es nativa fuera del disco: se monta el volumen ${req.volumen} por la pasarela local.` };
    }

    // Ramificada: solo falta cálculo y hay neurona para prestarlo; la interfaz va en local (§5).
    if (modos.includes("ramificada") && faltaSoloCalculo && plan.calculo !== undefined) {
        return { modo: "ramificada", destino: plan.calculo.nodoId, motivo: `La interfaz va en local y el cálculo se presta de ${plan.calculo.nodoId}: ${algoFalta}.` };
    }

    // Suelo (§4, regla 7): nunca «nada». Abre en local y dice qué falta.
    return { modo: "local", destino: destinoLocal(app), motivo: `Abre en local con avisos, porque le falta: ${algoFalta}.` };
}

/** Ruta local donde vive la app (módulo del OS) o su id si no tiene ruta. */
function destinoLocal(app: StarseedApp): string {
    return app.open.route ?? app.open.href ?? app.id;
}
