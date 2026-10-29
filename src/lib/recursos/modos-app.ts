// ════════════════════════════════════════════════════════════════
// Modos de apertura de una app en la malla (§5 apps-en-la-malla.md)
// ----------------------------------------------------------------
// Puro: decide cómo abrir una app desde una neurona concreta usando
// el plan de la bolsa y los recursos de esa neurona. Sin red, disco
// ni procesos: solo entrada → salida.
// ════════════════════════════════════════════════════════════════

import type { ModoEjecucion, StarseedApp } from "@/components/dashboard/apps/launcher-types";
import type { OfertaNeurona } from "./oferta";
import type { ResultadoParte } from "./bolsa";

/** Orden canónico de preferencia de los modos (§4): local primero, suelo al final. */
const ORDEN: ModoEjecucion[] = ["local", "por-bandas", "montada", "transmitida", "ramificada"];

/** Modos que la app admite. Sin `ejecucion` = ['local'], como hoy en el catálogo. */
export function modosAdmitidos(app: Pick<StarseedApp, "ejecucion">): ModoEjecucion[] {
    const declarados: ModoEjecucion[] = app.ejecucion?.length ? app.ejecucion : ["local"];
    return ORDEN.filter((modo) => declarados.includes(modo));
}

/** Lo que a esta neurona le falta para correr la app en local (vacío = cabe). */
export function faltaLocal(app: StarseedApp, neurona: OfertaNeurona): string[] {
    const req = app.requisitos;
    if (!req) return [];
    const falta: string[] = [];
    const comp = neurona.computo;
    if (req.ramMb !== undefined && comp.ramLibreMb < req.ramMb) {
        falta.push(`RAM ${req.ramMb} MB`);
    }
    if (req.gpu && !comp.gpu) falta.push("GPU");
    for (const motor of req.motores ?? []) {
        if (!comp.motores.includes(motor)) falta.push(`motor ${motor}`);
    }
    return falta;
}

/** Resultado de `comoAbrir`: modo, destino y motivo legible. */
export type DecisionApertura = {
    modo: ModoEjecucion;
    destino: string;
    motivo: string;
};

/**
 * Elige el modo de apertura con su motivo (§5): local si cabe; por-bandas si
 * es web/WASM con volumen; montada si el volumen fuera del disco está a mano;
 * transmitida si otra neurona la tiene prestada y la latencia sirve; ramificada
 * si solo falta cálculo. Suelo: local con aviso de lo que falta.
 */
export function comoAbrir(
    app: StarseedApp,
    neurona: OfertaNeurona,
    plan: { porParte: Record<string, ResultadoParte[]> }
): DecisionApertura {
    const falta = faltaLocal(app, neurona);
    const declarados: ModoEjecucion[] = app.ejecucion?.length ? app.ejecucion : ["local"];
    const deClase = (clase: string): ResultadoParte[] => plan.porParte[clase] ?? [];
    const hayVolumen = (): boolean => {
        const vol = app.requisitos?.volumen;
        if (!vol) return false;
        return neurona.almacen.volumenes.includes(vol) || deClase("bytes").length > 0;
    };
    const conVolumen = app.requisitos?.volumen !== undefined;
    const viable = (modo: ModoEjecucion): boolean => {
        switch (modo) {
            case "local":
                // Con volumen la app no corre completa: se trae por bandas.
                return !conVolumen && falta.length === 0;
            case "por-bandas":
            case "montada":
                return hayVolumen();
            case "transmitida":
                return deClase("ventana").some((r) => r.destino !== neurona.nodoId);
            case "ramificada":
                return falta.length > 0 && deClase("computo").length > 0;
        }
    };
    const decidir = (modo: ModoEjecucion): DecisionApertura => {
        switch (modo) {
            case "local":
                return { modo, destino: neurona.nodoId, motivo: "Corre en esta neurona: cumple los requisitos" };
            case "por-bandas":
            case "montada": {
                const vol = app.requisitos!.volumen!;
                const como = modo === "montada" ? "montado como disco por la pasarela local" : "por bandas: solo se baja lo que se usa";
                return { modo, destino: "local", motivo: `Volumen «${vol}» ${como}` };
            }
            case "transmitida": {
                const prestada = deClase("ventana").find((r) => r.destino !== neurona.nodoId)!;
                return { modo, destino: prestada.destino, motivo: `Corre en ${prestada.destino}; la ventana llega en vídeo por la malla` };
            }
            case "ramificada": {
                const destino = deClase("computo")[0].destino;
                return { modo, destino, motivo: `Interfaz en esta neurona; cálculo en ${destino} (falta ${falta.join(", ")})` };
            }
        }
    };
    for (const modo of declarados) {
        if (viable(modo)) return decidir(modo);
    }
    const aviso = falta.length > 0 ? `Falta ${falta.join(", ")} y la red no lo cubre` : "La red no ofrece una manera de abrirla";
    return { modo: "local", destino: "local", motivo: `Suelo: se abre en lo que se pueda de ${neurona.nodoId} — ${aviso}` };
}
