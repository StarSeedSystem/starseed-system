"use client";

/** Une las fuentes reales con los normalizadores puros. Contrato: §7 de cerebros-fusion-telepatia.md. */

import { leerEstadoAutonomo } from "@/lib/metagenesis/remoto-nodos-cliente";
import { leerHistorial } from "@/lib/genesis/historial";
import { misEntidades, propuestasDe } from "@/lib/genesis/entidades";
import { fetchAstraura158DreamStatus, fetchAstraura158ImaginationStatus } from "@/lib/astraura/astraura-158-client";
import { listRuns } from "@/lib/aurora/imagine";
import { leerInstalaciones } from "@/lib/instalaciones/instalaciones-store";
import { readDesktopsSnapshot } from "@/components/desktop/desktop-store";
import { presenciaActual } from "@/lib/neurons/presencia";
import {
    desdeActualizaciones, desdeAgentesMac, desdeImaginacion, desdeInstalaciones, desdeLatidos,
    desdeNodos, desdePoligenesis, desdePresencia, desdeSuenos, desdeVentanas, unirProcesos,
} from "./procesos-normalizar";
import type { ProcesoActivo } from "./procesos";

const PLAZO_MS = 4000;

/** Lo que ya se leyó de cada fuente, sin interpretar; las funciones puras lo normalizan. */
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

/** Compone todas las fuentes ya leídas. Puro: aquí no hay red ni disco. */
export function componerProcesos(f: FuentesProcesos): ProcesoActivo[] {
    return unirProcesos(
        desdeAgentesMac(f.agentes), desdeLatidos(f.medidores), desdeNodos(f.nodos),
        desdePoligenesis(f.poligenesis), desdeSuenos(f.suenos), desdeSuenos(f.suenosAstraura),
        desdeImaginacion(f.imaginacion), desdeInstalaciones(f.instalaciones),
        desdeActualizaciones(f.actualizaciones), desdeVentanas(f.ventanas), desdePresencia(f.presencia),
    );
}

async function jsonDe(url: string): Promise<unknown> {
    const control = new AbortController();
    const tope = setTimeout(() => control.abort(), PLAZO_MS);
    try {
        const r = await fetch(url, { cache: "no-store", signal: control.signal });
        return r.ok ? await r.json().catch(() => null) : null;
    } catch {
        return null;
    } finally {
        clearTimeout(tope);
    }
}

async function leerPoligenesis(): Promise<unknown> {
    const [historial, entidades] = await Promise.all([
        leerHistorial({ tipo: "persona" }).catch(() => null), misEntidades().catch(() => null),
    ]);
    const propuestas: unknown[] = [];
    if (entidades?.ok) {
        const resultados = await Promise.all(entidades.lista.slice(0, 12).map((e) => propuestasDe(e).catch(() => null)));
        for (const r of resultados) if (r?.ok) propuestas.push(...r.lista);
    }
    return { entradas: historial?.entradas ?? [], propuestas };
}

async function leerActualizaciones(atrasos: unknown): Promise<unknown> {
    const respuesta = await jsonDe("/api/library/actualizaciones");
    const fuentes = respuesta && typeof respuesta === "object" ? (respuesta as Record<string, unknown>).fuentes : [];
    return { atrasos, fuentes: Array.isArray(fuentes) ? fuentes : [] };
}

export interface OpcionesProcesos {
    atrasos?: unknown;
    presencia?: unknown;
}

/** Lee todas las fuentes y devuelve la lista unificada. Nunca lanza. */
export async function leerProcesos(opciones: OpcionesProcesos = {}): Promise<ProcesoActivo[]> {
    const [agentes, medidores, nodos, poligenesis, suenos, suenosAstraura, imaginacion, actualizaciones, runs] =
        await Promise.all([
            jsonDe("/api/mando/agentes"), jsonDe("/api/mando/medidores"), leerEstadoAutonomo().catch(() => null),
            leerPoligenesis(), jsonDe("/api/mando/suenos"), fetchAstraura158DreamStatus("local").catch(() => null),
            fetchAstraura158ImaginationStatus("local").catch(() => null), leerActualizaciones(opciones.atrasos),
            listRuns().catch(() => []),
        ]);
    let instalaciones: unknown = [];
    let ventanas: unknown = null;
    try {
        instalaciones = leerInstalaciones();
        ventanas = readDesktopsSnapshot();
    } catch {
        /* sin almacenamiento local: esas dos fuentes no aportan nada */
    }
    return componerProcesos({
        agentes, medidores, nodos, poligenesis, suenos, suenosAstraura,
        imaginacion: { imaginacion, runs }, instalaciones, actualizaciones, ventanas,
        presencia: opciones.presencia ?? presenciaActual(),
    });
}
