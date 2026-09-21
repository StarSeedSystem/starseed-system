// ════════════════════════════════════════════════════════════════════════════
// Consulta sin claves los upstream públicos de la Biblioteca.
// ════════════════════════════════════════════════════════════════════════════

import { REPO_DECISIONES } from "@/lib/library/fuentes-decision";
import {
    urlDeConsulta,
    leerVersion,
    compararVersiones,
    type EstadoActualizacion,
} from "@/lib/library/actualizaciones";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MS_CACHÉ = 6 * 60 * 60 * 1000;
const MS_CACHÉ_FALLO = 60 * 1000;
const MS_PLAZO_TOTAL = 8000;

export interface FuenteActualizacion {
    id: string;
    instalada: string;
    remota: string | null;
    estado: EstadoActualizacion;
    fecha: string | null;
    upstream: string;
}

interface Respuesta {
    generado: string;
    fuentes: FuenteActualizacion[];
}

// Deliberadamente por instancia: el contrato pide memoria, no disco compartido.
let caché: { caduca: number; datos: Respuesta } | null = null;

/* ── Consulta de un upstream ── */

async function consultarUpstream(
    upstream: string,
    tope: AbortSignal,
): Promise<{ remota: string | null; fecha: string | null }> {
    const url = urlDeConsulta(upstream);
    if (!url) return { remota: null, fecha: null };
    try {
        const respuesta = await fetch(url, {
            headers: { Accept: "application/json", "User-Agent": "starseed-os-biblioteca" },
            signal: tope,
        });
        if (!respuesta.ok) return { remota: null, fecha: null };
        const json: unknown = await respuesta.json();
        const leida = leerVersion(upstream, json);
        return { remota: leida?.version ?? null, fecha: leida?.fecha ?? null };
    } catch {
        return { remota: null, fecha: null };
    }
}

/* ── Ruta ── */

export async function GET(): Promise<Response> {
    const ahora = Date.now();
    if (caché && ahora < caché.caduca) {
        return Response.json(caché.datos, { headers: { "Cache-Control": "no-store" } });
    }

    const tope = new AbortController();
    const temporizadorTotal = setTimeout(() => tope.abort(), MS_PLAZO_TOTAL);

    try {
        const fuentes = await Promise.all(
            REPO_DECISIONES.packages.map(async (paquete): Promise<FuenteActualizacion> => {
                const upstream =
                    typeof paquete.payload?.upstream === "string" ? paquete.payload.upstream : "";
                const base: FuenteActualizacion = {
                    id: paquete.id,
                    instalada: paquete.version,
                    remota: null,
                    estado: "desconocida",
                    fecha: null,
                    upstream,
                };
                if (!upstream) return base;
                const { remota, fecha } = await consultarUpstream(upstream, tope.signal);
                if (!remota) return base;
                return {
                    ...base,
                    remota,
                    fecha,
                    estado: compararVersiones(paquete.version, remota),
                };
            }),
        );
        const datos: Respuesta = { generado: new Date(ahora).toISOString(), fuentes };
        const completa = fuentes.every(
            (fuente) => urlDeConsulta(fuente.upstream) === null || fuente.remota !== null,
        );
        caché = { caduca: ahora + (completa ? MS_CACHÉ : MS_CACHÉ_FALLO), datos };
        return Response.json(datos, { headers: { "Cache-Control": "no-store" } });
    } finally {
        clearTimeout(temporizadorTotal);
    }
}
