"use client";

/** Une las fuentes reales con los normalizadores puros. Contrato: §7 de cerebros-fusion-telepatia.md. */

import { leerEstadoAutonomo } from "@/lib/metagenesis/remoto-nodos-cliente";
import { leerHistorial } from "@/lib/genesis/historial";
import { misEntidades, propuestasDe } from "@/lib/genesis/entidades";
import { fetchAstraura158DreamStatus, fetchAstraura158ImaginationStatus } from "@/lib/astraura/astraura-158-client";
import { listRuns } from "@/lib/aurora/imagine";
import { leerInstalaciones } from "@/lib/instalaciones/instalaciones-store";
import { readDesktopsSnapshot } from "@/components/desktop/desktop-store";
import { listNeurons } from "@/lib/neurons/neurons";
import type { ProcesoActivo, HardwareServidor } from "./procesos";
import { hardwareDesdeMac, hardwareDesdeNeurona } from "./procesos";
import {
    desdeActualizaciones, desdeAgentesMac, desdeImaginacion, desdeInstalaciones, desdeLatidos,
    desdeNodos, desdePoligenesis, desdePresencia, desdeSuenos, desdeVentanas, unirProcesos,
} from "./procesos-normalizar";

const PLAZO_MS = 4000;

/** Interfaz de fuentes leídas (contexto de cliente). */
export interface FuentesProcesos {
    agentes?: unknown;
    medidores?: unknown;
    nodos?: unknown;
    poligenesis?: unknown;
    suenos?: unknown;
    suenosAstraura?: unknown;
    imaginacion?: unknown;
    instalaciones?: unknown;
    actualizaciones?: unknown;
    ventanas?: unknown;
    presencia?: unknown;
}

/** Pura: aquí no hay red ni disco. Une procesos de todas las fuentes. */
export function componerProcesos(f: FuentesProcesos): ProcesoActivo[] {
    return unirProcesos(
        desdeAgentesMac(f.agentes), desdeLatidos(f.medidores), desdeNodos(f.nodos),
        desdePoligenesis(f.poligenesis), desdeSuenos(f.suenos), desdeSuenos(f.suenosAstraura),
        desdeImaginacion(f.imaginacion), desdeInstalaciones(f.instalaciones),
        desdeActualizaciones(f.actualizaciones), desdeVentanas(f.ventanas), desdePresencia(f.presencia),
    );
}

/** Resultado de intentar leer una fuente: éxito, datos, tiempo ms, y motivo si falló. */
interface ResultadoFuente {
    ok: boolean;
    data: unknown;
    ms: number;
    motivo?: string;
}

/** Lee un endpoint fetch con tope de 4 s y manejo de códigos 401/403/404. */
async function leerFuenteFetch(url: string): Promise<ResultadoFuente> {
    const control = new AbortController();
    const tope = setTimeout(() => control.abort(), PLAZO_MS);
    const inicio = Date.now();
    try {
        const r = await fetch(url, { cache: "no-store", signal: control.signal });
        const ms = Date.now() - inicio;
        clearTimeout(tope);
        if (!r.ok) {
            const motivo = [401, 403, 404].includes(r.status)
                ? " no disponible aquí"
                : r.status
                    ? ` error ${r.status}`
                    : " sin respuesta";
            return { ok: false, data: null, ms, motivo };
        }
        const data = await r.json().catch(() => null);
        return { ok: true, data, ms, motivo: undefined };
    } catch (e) {
        const error = e as Error | DOMException | { message?: string; status?: number };
        clearTimeout(tope);
        const ms = Date.now() - inicio;
        if (error instanceof DOMException && error.name === "AbortError") {
            return { ok: false, data: null, ms, motivo: " tiempo agotado" };
        }
        if ((error as { status?: number }).status !== undefined) {
            const motivo = [401, 403, 404].includes((error as { status?: number }).status)
                ? " no disponible aquí"
                : ` error ${(error as { status?: number }).status}`;
            return { ok: false, data: null, ms, motivo };
        }
        const motivo = (error as Error).message ?? " error desconocido";
        return { ok: false, data: null, ms, motivo };
    }
}

/** Envuelve cualquier función que retorne Promise con tope de 4 s. */
async function leerFuenteFn(fn: () => Promise<unknown>): Promise<ResultadoFuente> {
    const control = new AbortController();
    const tope = setTimeout(() => control.abort(), PLAZO_MS);
    const inicio = Date.now();
    try {
        const data = await fn();
        const ms = Date.now() - inicio;
        clearTimeout(tope);
        return { ok: true, data, ms, motivo: undefined };
    } catch (e) {
        const error = e as Error | DOMException;
        clearTimeout(tope);
        const ms = Date.now() - inicio;
        if (error instanceof DOMException && error.name === "AbortError") {
            return { ok: false, data: null, ms, motivo: " tiempo agotado" };
        }
        const motivo = (error as Error).message ?? " error desconocido";
        return { ok: false, data: null, ms, motivo };
    }
}

/** Lee todas las fuentes y devuelve procesos, hardware y status de cada fuente. Nunca lanza. */
export async function leerProcesos(o?: { incluirMac?: boolean; atrasos?: unknown; presencia?: unknown }): Promise<{
    procesos: ProcesoActivo[];
    hardware: HardwareServidor[];
    fuentes: Array<{ nombre: string; ok: boolean; ms: number; motivo?: string }>;
}> {
    const incluirMac = o?.incluirMac !== false;

    // Todas las fuentes se leen en paralelo con tope de 4 s cada una.
    const [
        agentesR, medidoresR, suenosR, hardwareR,
        estadoR, historialR, dreamR, imaginacionR, runsR,
        instalR, desktopsR, neuronasR,
    ] = await Promise.all([
        // 1. /api/mando/agentes con timeout 4s
        leerFuenteFetch("/api/mando/agentes"),
        // 2. /api/mando/medidores con timeout 4s
        leerFuenteFetch("/api/mando/medidores"),
        // 3. /api/mando/suenos con timeout 4s
        leerFuenteFetch("/api/mando/suenos"),
        // 4. /api/mando/hardware con timeout 4s (solo Mac o sesión MetaGenesis)
        //    401/403/404 cuenta como "no disponible aquí", no error
        leerFuenteFetch(incluirMac ? "/api/mando/hardware" : "/api/mando/hardware"),
        // 5. leerEstadoAutonomo() con timeout 4s
        leerFuenteFn(() => leerEstadoAutonomo()),
        // 6. leerHistorial() con timeout 4s
        leerFuenteFn(() => leerHistorial({ tipo: "persona" })),
        // 7. fetchAstraura158DreamStatus("local") con timeout 4s
        leerFuenteFn(() => fetchAstraura158DreamStatus("local")),
        // 8. fetchAstraura158ImaginationStatus("local") con timeout 4s
        leerFuenteFn(() => fetchAstraura158ImaginationStatus("local")),
        // 9. listRuns() de imagine con timeout 4s
        leerFuenteFn(() => listRuns().catch(() => [])),
        // 10. leerInstalaciones() - función del store (síncrona, envolvemos)
        leerFuenteFn(() => Promise.resolve(leerInstalaciones())),
        // 11. readDesktopsSnapshot() - síncrona cliente
        leerFuenteFn(() => Promise.resolve(readDesktopsSnapshot())),
        // 12. listNeurons() para hardware de neuronas con timeout 4s
        leerFuenteFn(() => listNeurons()),
    ]);

    // Construir el array de status de fuentes (12 entradas, el orden importa)
    const statusFuentes: Array<{ nombre: string; ok: boolean; ms: number; motivo?: string }> = [
        { nombre: "/api/mando/agentes", ok: agentesR.ok, ms: agentesR.ms, motivo: agentesR.motivo },
        { nombre: "/api/mando/medidores", ok: medidoresR.ok, ms: medidoresR.ms, motivo: medidoresR.motivo },
        { nombre: "/api/mando/suenos", ok: suenosR.ok, ms: suenosR.ms, motivo: suenosR.motivo },
        { nombre: incluirMac ? "/api/mando/hardware" : "/api/mando/hardware (solo Mac)", ok: hardwareR.ok, ms: hardwareR.ms, motivo: hardwareR.motivo },
        { nombre: "leerEstadoAutonomo()", ok: estadoR.ok, ms: estadoR.ms, motivo: estadoR.motivo },
        { nombre: "leerHistorial()", ok: historialR.ok, ms: historialR.ms, motivo: historialR.motivo },
        { nombre: "fetchAstraura158DreamStatus()", ok: dreamR.ok, ms: dreamR.ms, motivo: dreamR.motivo },
        { nombre: "fetchAstraura158ImaginationStatus()", ok: imaginacionR.ok, ms: imaginacionR.ms, motivo: imaginacionR.motivo },
        { nombre: "listRuns()", ok: runsR.ok, ms: runsR.ms, motivo: runsR.motivo },
        { nombre: "leerInstalaciones()", ok: instalR.ok, ms: instalR.ms, motivo: instalR.motivo },
        { nombre: "readDesktopsSnapshot()", ok: desktopsR.ok, ms: desktopsR.ms, motivo: desktopsR.motivo },
        { nombre: "listNeurons()", ok: neuronasR.ok, ms: neuronasR.ms, motivo: neuronasR.motivo },
    ];

    // Normalizar procesos usando los normalizadores puros con los datos de cada fuente
    // Cada desde* function maneja null/undefined retornando array vacío
    const ags = agentesR.ok && agentesR.data ? desdeAgentesMac(agentesR.data) : [];
    const mds = medidoresR.ok && medidoresR.data ? desdeLatidos(medidoresR.data) : [];
    const nds = estadoR.ok && estadoR.data ? desdeNodos(estadoR.data) : [];
    const pgss = desdePoligenesis(undefined); // poligenesis no tiene fetch directo aquí
    const srs = suenosR.ok && suenosR.data ? desdeSuenos(suenosR.data) : [];
    const sas = imaginacionR.ok && imaginacionR.data ? desdeImaginacion(imaginacionR.data) : [];
    const sts = historialR.ok && historialR.data ? desdeActualizaciones(historialR.data) : [];
    const wis = desktopsR.ok && desktopsR.data ? desdeVentanas(desktopsR.data) : [];
    const insData = instalR.ok && instalR.data ? instalR.data : [];
    const ins = desdeInstalaciones(insData);

    const todosProcesos = unirProcesos(ags, mds, nds, pgss, srs, sas, sts, wis, ins);

    // Extraer hardware: /api/mando/hardware para la Mac + listNeurons para neuronas
    const hardware: HardwareServidor[] = [];

    if (incluirMac && hardwareR.ok && hardwareR.data) {
        const h = hardwareDesdeMac(hardwareR.data as unknown as Record<string, unknown>, Date.now());
        if (h) hardware.push(h);
    }

    try {
        const neuronaData = neuronasR.ok && neuronasR.data ? neuronasR.data : [];
        const neuronasList = Array.isArray(neuronaData) ? neuronaData : [];
        for (const n of neuronasList) {
            try {
                const hw = hardwareDesdeNeurona(n, Date.now());
                if (hw) hardware.push(hw);
            } catch {
                /* ignorado */
            }
        }
    } catch {
        /* ignorado */
    }

    return {
        procesos: todosProcesos,
        hardware,
        fuentes: statusFuentes,
    };
}

/** Mantiene la firma original exportada para compatibilidad. */
export { type FuentesProcesos };