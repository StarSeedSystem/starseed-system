// ════════════════════════════════════════════════════════════════════════════
// Consulta sin claves los upstream públicos de la Biblioteca.
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync } from "node:fs";
import path from "node:path";
import { REPO_DECISIONES } from "@/lib/library/fuentes-decision";
import {
    urlDeConsulta,
    leerVersion,
    leerVersionCodeberg,
    validarPatronTag,
    compararVersiones,
    consultarCodeberg,
    rutaTrasladoCodeberg,
    BASE_CODEBERG,
    type EstadoActualizacion,
    type PayloadActualizacion,
} from "@/lib/library/actualizaciones";
import { fichasProtomolecula, type VersionProto } from "@/lib/protomolecula/biblioteca-protomolecula";
import { CATALOGO_PROTOMOLECULA } from "@/lib/protomolecula/catalogo-herramientas";

/* ── Fichas de la Protomolécula con repo: entran a la misma comprobación ── */

interface EntradaFuente {
    id: string;
    instalada: string;
    upstream: string;
    payload?: PayloadActualizacion;
}

function fuentesProtomolecula(): EntradaFuente[] {
    try {
        const ruta = path.join(process.cwd(), "config", "protomolecula-versiones.json");
        const json = JSON.parse(readFileSync(ruta, "utf8")) as {
            herramientas?: Record<string, VersionProto>;
        };
        const versiones = json.herramientas ?? {};
        return fichasProtomolecula(versiones, CATALOGO_PROTOMOLECULA)
            .filter((f) => typeof f.enlaces.repo === "string") // sin repo: sin comprobación
            .map((f) => ({
                id: `proto-${f.id}`,
                instalada: versiones[f.id]?.sha ?? "",
                upstream: f.enlaces.repo as string,
            }));
    } catch {
        return [];
    }
}

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
    aviso: string | null;
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
    payload: PayloadActualizacion | undefined,
    tope: AbortSignal,
): Promise<{ remota: string | null; fecha: string | null; error: string | null }> {
    const traslado = rutaTrasladoCodeberg(payload?.trasladadoA);
    const url = traslado
        ? `${BASE_CODEBERG}/api/v1/repos/${traslado}/releases?limit=1`
        : urlDeConsulta(upstream, payload);
    if (!url) return { remota: null, fecha: null, error: null };
    try {
        const respuesta = await fetch(url, {
            headers: { Accept: "application/json", "User-Agent": "starseed-os-biblioteca" },
            signal: tope,
        });
        if (respuesta.ok) {
            const json: unknown = await respuesta.json();
            const leida = traslado
                ? leerVersionCodeberg(json)
                : leerVersion(upstream, json, payload);
            if (leida) return { remota: leida.version, fecha: leida.fecha, error: null };
        }
    } catch {
        // si es Codeberg, el respaldo de etiquetas dirá qué pasó
    }
    if (!traslado) return { remota: null, fecha: null, error: null };
    const leída = await consultarCodeberg(
        payload?.trasladadoA,
        (u, init) => fetch(u, { ...init, signal: tope }),
        "tags",
    );
    return { remota: leída.version, fecha: leída.fecha, error: leída.error };
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
        const entradas: EntradaFuente[] = REPO_DECISIONES.packages
            .map((paquete): EntradaFuente => ({
                id: paquete.id,
                instalada: paquete.version,
                upstream:
                    typeof paquete.payload?.upstream === "string" ? paquete.payload.upstream : "",
                payload: paquete.payload,
            }))
            .concat(fuentesProtomolecula());
        const fuentes = await Promise.all(
            entradas.map(async (entrada): Promise<FuenteActualizacion> => {
                const { upstream, payload } = entrada;
                const patronTag = payload?.patronTag;
                const base: FuenteActualizacion = {
                    id: entrada.id,
                    instalada: entrada.instalada,
                    remota: null,
                    estado: "desconocida",
                    fecha: null,
                    upstream,
                    aviso:
                        patronTag === undefined || patronTag === null
                            ? null
                            : validarPatronTag(patronTag).error,
                };
                if (!upstream && !rutaTrasladoCodeberg(payload?.trasladadoA)) return base;
                const { remota, fecha, error } = await consultarUpstream(
                    upstream,
                    payload,
                    tope.signal,
                );
                if (!remota) return base.aviso ? base : { ...base, aviso: error ?? null };
                return {
                    ...base,
                    remota,
                    fecha,
                    estado: compararVersiones(entrada.instalada, remota),
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
