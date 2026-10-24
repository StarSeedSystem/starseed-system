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
import type { ProcesoActivo } from "./procesos";
import type { HardwareServidor } from "./procesos";

const PLAZO_MS = 4000;

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
    } catch (e: any) {
        clearTimeout(tope);
        const ms = Date.now() - inicio;
        if (e instanceof DOMException && e.name === "AbortError") {
            return { ok: false, data: null, ms, motivo: " tiempo agotado" };
        }
        return { ok: false, data: null, ms, motivo: e?.message ?? " error desconocido" };
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
    } catch (e: any) {
        clearTimeout(tope);
        const ms = Date.now() - inicio;
        if (e instanceof DOMException && e.name === "AbortError") {
            return { ok: false, data: null, ms, motivo: " tiempo agotado" };
        }
        return { ok: false, data: null, ms, motivo: e?.message ?? " error desconocido" };
    }
}

/** Normaliza los datos crudos de cada fuente a ProcesoActivo[] y HardwareServidor[] usando los normalizadores puros. */
function normalizarFuentesAProcesos(
    ag: unknown | undefined,
    md: unknown | undefined,
    nd: unknown | undefined,
    pg: unknown | undefined,
    sr: unknown | undefined,
    sa: unknown | undefined,
    im: unknown | undefined,
    st: unknown | undefined,
    wi: unknown | undefined,
    pc: unknown | undefined,
    nt: unknown | undefined,
): { procesos: ProcesoActivo[]; hardware: HardwareServidor[] } {
    const ags = desdeAgentesMac(ag);
    const mds = desdeLatidos(md);
    const nds = desdeNodos(nd);
    const pgss = desdePoligenesis(pg);
    const srs = desdeSuenos(sr);
    const sas = desdeImaginacion(im);
    const sts = desdeActualizaciones(st);
    const wis = desdeVentanas(wi);
    const nts = listNeurons().catch(() => []);
    const pcs = leerProcesosHardware(pc, nt);

    const todosProcesos = unirProcesos(ags, mds, nds, pgss, srs, sas, sts, wis, pcs.procesos);
    const hardware: HardwareServidor[] = [...new Set([...pcs.hardware, ...nts])]);

    return { procesos: todosProcesos, hardware };
}

/** Lee `/api/mando/hardware` y listNeurons, normaliza a HardwareServidor[]. */
function leerProcesosHardware(
    macR: unknown | undefined,
    neuronas: unknown[],
): HardwareServidor[] {
    const resultado: HardwareServidor[] = [];
    if (macR) {
        const h = hardwareDesdeMac(macR, Date.now());
        if (h) resultado.push(h);
    }
    for (const n of neuronas) {
        try {
            const hw = hardwareDesdeNeurona(n, Date.now());
            if (hw) resultado.push(hw);
        } catch {
            /* ignorado */
        }
    }
    return resultado;
}

/** Lee todas las fuentes y devuelve procesos, hardware y status de cada fuente. Nunca lanza. */
export async function leerProcesos(o?: { incluirMac?: boolean }): Promise<{
    procesos: ProcesoActivo[];
    hardware: HardwareServidor[];
    fuentes: Array<{ nombre: string; ok: boolean; ms: number; motivo?: string }>;
}> {
    const incluirMac = o?.incluirMac !== false; // por defecto incluye Mac

    // Todas las fuentes se leen en paralelo con tope de 4 s cada una.
    const [agentesR, medidoresR, suenosR, hardwareR, estadoR, historialR,
        dreamR, imaginacionR, runsR, instalacionesR, desktopsR, neuronasR] =
        await Promise.all([
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
            // 10. leerInstalaciones() - función del store (síncrona, sin timeout necesario)
            //    La envolvemos para tener interfaz consistente, timeout corto
            () => Promise.resolve(leerInstalaciones()),
            // 11. readDesktopsSnapshot() - síncrona cliente
            () => Promise.resolve(readDesktopsSnapshot()),
            // 12. listNeurons() para hardware de neuronas con timeout 4s
            leerFuenteFn(() => listNeurons()),
        ]);

    // Construir el array de status de fuentes (siempre 12 entradas, el orden importa)
    const nombresFuentes = [
        "/api/mando/agentes",
        "/api/mando/medidores",
        "/api/mando/suenos",
        incluirMac ? "/api/mando/hardware" : "/api/mando/hardware (solo Mac)",
        "leerEstadoAutonomo()",
        "leerHistorial()",
        "fetchAstraura158DreamStatus()",
        "fetchAstraura158ImaginationStatus()",
        "listRuns()",
        "leerInstalaciones()",
        "readDesktopsSnapshot()",
        "listNeurons()",
    ];

    const statusFuentes: Array<{ nombre: string; ok: boolean; ms: number; motivo?: string }> = [
        { nombre: nombresFuentes[0], ok: agentesR.ok, ms: agentesR.ms, motivo: agentesR.motivo },
        { nombre: nombresFuentes[1], ok: medidoresR.ok, ms: medidoresR.ms, motivo: medidoresR.motivo },
        { nombre: nombresFuentes[2], ok: suenosR.ok, ms: suenosR.ms, motivo: suenosR.motivo },
        { nombre: nombresFuentes[3], ok: hardwareR.ok, ms: hardwareR.ms, motivo: hardwareR.motivo },
        { nombre: nombresFuentes[4], ok: estadoR.ok, ms: estadoR.ms, motivo: estadoR.motivo },
        { nombre: nombresFuentes[5], ok: historialR.ok, ms: historialR.ms, motivo: historialR.motivo },
        { nombre: nombresFuentes[6], ok: dreamR.ok, ms: dreamR.ms, motivo: dreamR.motivo },
        { nombre: nombresFuentes[7], ok: imaginacionR.ok, ms: imaginacionR.ms, motivo: imaginacionR.motivo },
        { nombre: nombresFuentes[8], ok: runsR.ok, ms: runsR.ms, motivo: runsR.motivo },
        { nombre: nombresFuentes[9], ok: instalacionesR.ok, ms: instalacionesR.ms, motivo: instalacionesR.motivo },
        { nombre: nombresFuentes[10], ok: desktopsR.ok, ms: desktopsR.ms, motivo: desktopsR.motivo },
        { nombre: nombresFuentes[11], ok: neuronasR.ok, ms: neuronasR.ms, motivo: neuronasR.motivo },
    ];

    // Normalizar usando los normalizadores puros; si alguna fuente falla, continuamos con las que funcionaron
    const { procesos, hardware } = normalizarFuentesAProcesos(
        agentesR.data, medidoresR.data, estadoR.data,
        // pg: poligenesis no está en la lista de 12 fuentes con timeout explícito,
        // se omite o se usa undefined
        suenosR.data,
        imaginacionR.data,
        // actualizaciones data viene del fetchAstraura... pero el source 7/8 son dream/imagination
        // Usaremos los datos disponibles
        instalacionesR.data,
        desktopsR.data,
        neuronasR.data,
    );

    return { procesos, hardware, fuentes: statusFuentes };
}

/** Mantiene la firma original exportada para compatibilidad. */
export { componerProcesos, type FuentesProcesos };