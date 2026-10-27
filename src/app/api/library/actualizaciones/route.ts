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
import {
    fijarVersion,
    nombreActivoCli,
    nombreActivoWeb,
    nombreActivoRare,
    parseSha256Sums,
    verificarActivo,
    esActivoPermitido,
    TOPE_ACTIVO_BYTES,
    type AppArtcraft,
    type FormatoRare,
    type VeredictoActivo,
} from "@/lib/artcraft/huellas";

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
            .map((f): EntradaFuente => {
                // Las cuatro fichas de ArtCraft y Rare (artcraft-y-rare.md §6) siguen SU canal
                // del catálogo: las Craft apps por releases y Rare por tags con su filtro.
                // El resto de la Protomolécula sigue como estaba: commits con huella corta.
                const ficha = CATALOGO_PROTOMOLECULA.find((h) => h.id === f.id);
                if (!ficha || !APPS_HUELLA.has(`proto-${ficha.id}`)) {
                    return { id: `proto-${f.id}`, instalada: versiones[f.id]?.sha ?? "", upstream: f.enlaces.repo as string };
                }
                const fuente = ficha.actualizacion.fuente;
                return {
                    id: `proto-${f.id}`,
                    instalada: versiones[f.id]?.version ?? "",
                    upstream: f.enlaces.repo as string,
                    payload:
                        fuente === "github-tags"
                            ? { canal: "tags", patronTag: ficha.actualizacion.filtro }
                            : fuente === "github-releases"
                              ? { canal: "releases" }
                              : {},
                };
            });
    } catch {
        return [];
    }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MS_CACHÉ = 6 * 60 * 60 * 1000;
const MS_CACHÉ_FALLO = 60 * 1000;
const MS_PLAZO_TOTAL = 8000;
const MS_PLAZO_HUELLA = 4000;
const RE_HUELLA_VERDE = /^[0-9a-f]{64}$/;
const FORMATOS_RARE: readonly FormatoRare[] = ["arm64.dmg", "x86_64.dmg", "arm64.AppImage", "x86_64.AppImage"];

/* ── §6 de artcraft-y-rare.md: cada activo que el OS aloje se fija por su SHA256SUMS ── */

const APPS_HUELLA = new Set(["proto-figcraft", "proto-gridcraft", "proto-deckcraft", "proto-rare"]);

export interface HuellaFijada {
    /** Nombre del activo según el contrato (`figcraft-web-0.11.2.zip`, `Rare-1.12.0.237-arm64.dmg`…). */
    activo: string;
    /** Huella publicada en el SHA256SUMS.txt de la release, ya en minúsculas. */
    sha256: string;
    /** null = no hubo datos suficientes para comprobar: no se afirma nada. */
    verificada: boolean | null;
    motivo: string;
}

export interface HuellasDeVersion {
    /** «dueño/repo» de la release comprobada. */
    repo: string;
    /** Etiqueta de release de la que salió el SHA256SUMS.txt («v0.11.2»). */
    etiqueta: string;
    fijadas: HuellaFijada[];
}

export interface FuenteActualizacion {
    id: string;
    instalada: string;
    remota: string | null;
    estado: EstadoActualizacion;
    fecha: string | null;
    upstream: string;
    aviso: string | null;
    /** Huellas de los activos de ArtCraft y Rare de esa versión (artcraft-y-rare.md §6). */
    huellas: HuellasDeVersion | null;
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

/* ── §6 de artcraft-y-rare.md: cada activo que el OS aloje se fija por su SHA256SUMS ── */

/**
 * Igual que `compararVersiones`, pero para etiquetas de release de las cuatro fichas
 * de ArtCraft y Rare: «v0.10.0» contra «v0.11.2». Una parte que no sea τους dígitos
 * sale «desconocida»: no se inventa el estado.
 */
function compararEtiquetas(instalada: string, remota: string): EstadoActualizacion {
    const partes = (v: string): number[] | null => {
        const piezas = v.replace(/^v/, "").split(".");
        return piezas.length > 1 && piezas.every((p) => /^\d+$/.test(p)) ? piezas.map(Number) : null;
    };
    const a = partes(instalada);
    const b = partes(remota);
    if (!a || !b) return "desconocida";
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const local = a[i] ?? 0;
        const remota = b[i] ?? 0;
        if (local !== remota) return local < remota ? "hay-actualizacion" : "igual";
    }
    return "igual";
}

/** Descarga el zip web de la release (el activo que el OS aloja) y comprueba su huella; null sin datos. */
async function verificarZipWeb(
    repo: string,
    etiqueta: string,
    activo: string,
    sumas: Map<string, string>,
    signal: AbortSignal,
): Promise<VeredictoActivo | null> {
    try {
        const respuesta = await fetch(
            `https://github.com/${repo}/releases/download/${encodeURIComponent(etiqueta)}/${encodeURIComponent(activo)}`,
            { signal },
        );
        if (!respuesta.ok) return null;
        const longitud = Number(respuesta.headers.get("content-length"));
        if (Number.isFinite(longitud) && longitud > TOPE_ACTIVO_BYTES) return null;
        return await verificarActivo(activo, new Uint8Array(await respuesta.arrayBuffer()), sumas);
    } catch {
        return null;
    }
}

/** Fija las huellas de la versión remota de una ficha de ArtCraft o Rare; null si no se puede. */
async function huellasDeRemota(
    entrada: EntradaFuente,
    remota: string,
    signal: AbortSignal,
): Promise<HuellasDeVersion | null> {
    const m = /github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/.exec(entrada.upstream);
    const repo = m ? m[1].replace(/\.git$/, "") : null;
    if (!repo) return null;
    const idArtcraft = entrada.id.replace(/^proto-/, "") as AppArtcraft | "rare";
    let sumas: Map<string, string>;
    try {
        const respuesta = await fetch(
            `https://github.com/${repo}/releases/download/${encodeURIComponent(remota)}/SHA256SUMS.txt`,
            { signal },
        );
        if (!respuesta.ok) return null;
        sumas = parseSha256Sums(await respuesta.text());
    } catch {
        return null;
    }
    if (sumas.size === 0) return { repo, etiqueta: remota, fijadas: [] };
    // Solo los activos que nombra el contrato y cuya huella publican las sumas se dan por fijados.
    const candidatos: { nombre: string; zipWeb: boolean }[] =
        idArtcraft === "rare"
            ? FORMATOS_RARE.map((formato) => ({ nombre: nombreActivoRare(remota, formato), zipWeb: false }))
            : [
                  { nombre: fijarVersion(idArtcraft, remota, sumas)?.activo ?? nombreActivoWeb(idArtcraft, remota), zipWeb: true },
                  { nombre: nombreActivoCli(idArtcraft, remota), zipWeb: false },
              ];
    const fijadas: HuellaFijada[] = [];
    for (const candidato of candidatos) {
        if (!esActivoPermitido(candidato.nombre)) continue;
        const publicada = sumas.get(candidato.nombre);
        if (!publicada || !RE_HUELLA_VERDE.test(publicada)) continue;
        const fijada: HuellaFijada = { activo: candidato.nombre, sha256: publicada, verificada: null, motivo: "" };
        // El zip web es el que el OS serviría como origen aparte: se verifica ANTES, nunca después.
        if (candidato.zipWeb) {
            const veredicto = await verificarZipWeb(repo, remota, candidato.nombre, sumas, signal);
            fijada.verificada = veredicto !== null ? veredicto.ok : null;
            fijada.motivo = veredicto !== null ? veredicto.motivo : "sin datos para comprobar";
        }
        fijadas.push(fijada);
    }
    return { repo, etiqueta: remota, fijadas };
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
            ...fichasIaConUpstreamGitHub([
                ...FICHAS_IA_LOCALES,
                ...FICHAS_REPOS_OS,
                ...FICHAS_REPOS_1025,
                ...FICHAS_VIEJAS_SEGUIMIENTO_1025,
                ...FICHAS_REPOS_1026,
                ...FICHAS_VIEJAS_SEGUIMIENTO_1026,
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
                    aviso:
                        patronTag === undefined || patronTag === null
                            ? null
                            : validarPatronTag(patronTag).error,
                    huellas: null,
                };
                if (!upstream) return base;
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
                    estado: APPS_HUELLA.has(entrada.id)
                        ? compararEtiquetas(entrada.instalada, remota)
                        : compararVersiones(entrada.instalada, remota),
                };
            }),
        );
        // artcraft-y-rare.md §6: nadie aloja ni sirve un zip web sin su huella fijada
        // por el SHA256SUMS.txt de su release, verificada ANTES de servirse como origen aparte.
        const huellaTope = new AbortController();
        const temporizadorHuella = setTimeout(() => huellaTope.abort(), MS_PLAZO_HUELLA);
        try {
            await Promise.all(
                fuentes.map(async (fuente) => {
                    if (!fuente.remota || !APPS_HUELLA.has(fuente.id)) return;
                    fuente.huellas = await huellasDeRemota(fuente, fuente.remota, huellaTope.signal);
                }),
            );
        } finally {
            clearTimeout(temporizadorHuella);
        }
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
