// ════════════════════════════════════════════════════════════════════════════
// Consulta sin claves los upstream públicos de la Biblioteca.
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync } from "node:fs";
import path from "node:path";
import { REPO_DECISIONES } from "@/lib/library/fuentes-decision";
import { FICHAS_IA_LOCALES, fichasIaConUpstreamGitHub } from "@/lib/library/fuentes-ia-locales";
import { FICHAS_REPOS_OS } from "@/lib/library/repos-os";
import {
    urlDeConsulta,
    leerVersion,
    validarPatronTag,
    compararVersiones,
    consultarCodeberg,
    rutaTrasladoCodeberg,
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
    if (traslado) {
        const leída = await consultarCodeberg(
            payload?.trasladadoA,
            (url, init) => fetch(url, { ...init, signal: tope }),
        );
        return { remota: leída.version, fecha: leída.fecha, error: leída.error };
    }
    const url = urlDeConsulta(upstream, payload);
    if (!url) return { remota: null, fecha: null, error: null };
    try {
        const respuesta = await fetch(url, {
            headers: { Accept: "application/json", "User-Agent": "starseed-os-biblioteca" },
            signal: tope,
        });
        if (!respuesta.ok) return { remota: null, fecha: null, error: null };
        const json: unknown = await respuesta.json();
        const leida = leerVersion(upstream, json, payload);
        return { remota: leida?.version ?? null, fecha: leida?.fecha ?? null, error: null };
    } catch {
        return { remota: null, fecha: null, error: null };
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
        // Fuentes de decisiones + fichas `ai-source` de modelos locales con repo en GitHub
        // (TurboFieldfare: sin releases, se sigue por commits). Sin duplicar ids.
        const idsDecisiones = new Set(REPO_DECISIONES.packages.map((p) => p.id));
        const fichas = [
            ...REPO_DECISIONES.packages,
            ...fichasIaConUpstreamGitHub([...FICHAS_IA_LOCALES, ...FICHAS_REPOS_OS]).filter((p) => !idsDecisiones.has(p.id)),
        ];
        const entradas: EntradaFuente[] = fichas
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
                const trasladado = rutaTrasladoCodeberg(payload?.trasladadoA);
                if (!upstream && !trasladado) return base;
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
