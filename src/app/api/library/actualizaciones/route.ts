// ════════════════════════════════════════════════════════════════════════════
// Consulta sin claves los upstream públicos de la Biblioteca.
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync } from "node:fs";
import path from "node:path";
import { REPO_DECISIONES } from "@/lib/library/fuentes-decision";
import { FICHAS_IA_LOCALES, fichasIaConUpstreamGitHub } from "@/lib/library/fuentes-ia-locales";
import { FICHAS_REPOS_OS } from "@/lib/library/repos-os";
import { FICHAS_REPOS_1025, FICHAS_VIEJAS_SEGUIMIENTO_1025 } from "@/lib/library/repos-1025";
import { FICHAS_REPOS_1026, FICHAS_VIEJAS_SEGUIMIENTO_1026 } from "@/lib/library/repos-1026";
import { FICHAS_REPOS_1027 } from "@/lib/library/repos-1027";
import { FICHAS_REPOS_1027B } from "@/lib/library/repos-1027b";
import { FICHAS_REPOS_1028 } from "@/lib/library/repos-1028";
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
import { fijarVersion, esActivoPermitido, parseSha256Sums, type AppHuellas } from "@/lib/artcraft/huellas";

/* ── Fichas de la Protomolécula con repo: entran a la misma comprobación ── */

interface EntradaFuente {
    id: string;
    instalada: string;
    upstream: string;
    payload?: PayloadActualizacion;
}

const APPS_CRAFT: ReadonlyMap<string, AppHuellas> = new Map([
    ["proto-figcraft", "figcraft"],
    ["proto-gridcraft", "gridcraft"],
    ["proto-deckcraft", "deckcraft"],
]);

/* ── Huellas SHA256 de las Craft Apps (artcraft-y-rare.md §6): una versión nueva de FigCraft,
GridCraft y DeckCraft NO se fija ni se aloja sola: primero su `SHA256SUMS.txt` y la palabra de
Alex. El `aviso` lo aplica el módulo puro `src/lib/artcraft/huellas.ts`. ── */
async function fijarHuellasDeCraft(fuente: FuenteActualizacion, tope: AbortSignal) {
    const app = APPS_CRAFT.get(fuente.id);
    if (!app || !fuente.remota) return null;
    try {
        const r = await fetch(
            `https://github.com/storytold/${app}/releases/download/${fuente.remota}/SHA256SUMS.txt`,
            { headers: { "User-Agent": "starseed-os-biblioteca" }, signal: tope },
        );
        if (!r.ok) return null;
        const fijada = fijarVersion(app, fuente.remota, parseSha256Sums(await r.text()));
        if (!fijada || !esActivoPermitido(fijada.activo))
            return {
                ...fuente,
                aviso: `versión nueva sin huella fijada: se para — ${fuente.remota} exige su SHA256SUMS.txt y la palabra de Alex (artcraft-y-rare.md §6)`,
            };
        return {
            ...fuente,
            huellaWeb: fijada.sha256,
            aviso: `huella fijada — ${fijada.activo}: ${fijada.sha256.slice(0, 8)}… (artcraft-y-rare.md §6)`,
        };
    } catch {
        return null;
    }
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
    /** Huella del zip web fijada contra el `SHA256SUMS.txt` de la release (solo Craft Apps). */
    huellaWeb: string | null;
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
            // Tanda 1025: las 26 nuevas y las 3 fichas viejas (iatool-*) que ahora siguen su repo real.
            // Tanda 1026: las 4 nuevas y Open Generative AI (iatool-*), que sigue el suyo.
            // Tanda 1027: OpenMausBot, Insomnia y Colibri, por etiquetas vX.Y.Z.
            // Tanda 1027b: Meta^n por commits y Memvid por etiquetas vX.Y.Z.
            // Tanda 1028: LEANN por etiquetas vX.Y.Z.
            ...fichasIaConUpstreamGitHub([
                ...FICHAS_IA_LOCALES,
                ...FICHAS_REPOS_OS,
                ...FICHAS_REPOS_1025,
                ...FICHAS_VIEJAS_SEGUIMIENTO_1025,
                ...FICHAS_REPOS_1026,
                ...FICHAS_VIEJAS_SEGUIMIENTO_1026,
                ...FICHAS_REPOS_1027,
                ...FICHAS_REPOS_1027B,
                ...FICHAS_REPOS_1028,
            ]).filter((p) => !idsDecisiones.has(p.id)),
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
                    huellaWeb: null,
                    aviso:
                        patronTag === undefined || patronTag === null
                            ? null
                            : validarPatronTag(patronTag).error,
                };
                if (!upstream) return base;
                const { remota, fecha, error } = await consultarUpstream(
                    upstream,
                    payload,
                    tope.signal,
                );
                if (!remota) return base.aviso ? base : { ...base, aviso: error ?? null };
                const concordada: FuenteActualizacion = {
                    ...base,
                    remota,
                    fecha,
                    estado: compararVersiones(entrada.instalada, remota),
                };
                return (await fijarHuellasDeCraft(concordada, tope.signal)) ?? concordada;
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
