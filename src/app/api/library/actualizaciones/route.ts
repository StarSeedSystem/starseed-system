// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Biblioteca · /api/library/actualizaciones (JV12 · Ola 360)
// ------------------------------------------------------------------------------
// Recorre las fuentes de REPO_DECISIONES y mira si su upstream público tiene
// una versión distinta de la registrada. SIN claves (repos y modelos públicos;
// un 403 de GitHub por límite de peticiones se devuelve como «desconocida»,
// no como error). Caché en memoria del proceso de 6 horas. Plazo total de 8 s:
// lo que no contesta a tiempo queda «desconocida». La pantalla NUNCA espera a
// esta ruta para pintarse.
//
// Persistencia: el sha remoto se registra en
// `starseed_memory_root/mando/biblioteca-versiones.json` la PRIMERA vez que se
// ve; a partir de ahí se compara sha contra sha (ver `resolverInstaladaConocida`).
// El módulo puro `src/lib/library/actualizaciones.ts` no toca disco: eso es
// trabajo de esta ruta.
// ════════════════════════════════════════════════════════════════════════════

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { REPO_DECISIONES } from "@/lib/library/fuentes-decision";
import {
    urlDeConsulta,
    leerVersion,
    compararVersiones,
    resolverInstaladaConocida,
    type EstadoActualizacion,
} from "@/lib/library/actualizaciones";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MS_CACHÉ = 6 * 60 * 60 * 1000;
const MS_PLAZO_TOTAL = 8000;
const MS_PETICION = 6000;

const ARCHIVO_VERSIONES = path.join(
    process.cwd(),
    "starseed_memory_root",
    "mando",
    "biblioteca-versiones.json",
);

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

/* ── Caché en memoria del proceso ── */

let caché: { instante: number; datos: Respuesta } | null = null;

/* ── Registro de versiones conocidas (disco) ── */

type RegistroVersiones = Record<string, string>;

async function leerRegistro(): Promise<RegistroVersiones> {
    try {
        return JSON.parse(await readFile(ARCHIVO_VERSIONES, "utf-8")) as RegistroVersiones;
    } catch {
        return {};
    }
}

async function guardarRegistro(registro: RegistroVersiones): Promise<void> {
    try {
        await mkdir(path.dirname(ARCHIVO_VERSIONES), { recursive: true });
        await writeFile(ARCHIVO_VERSIONES, JSON.stringify(registro, null, 2), "utf-8");
    } catch {
        // Si no se puede escribir, la próxima pasada vuelve a empezar: no es grave.
    }
}

/* ── Consulta de un upstream ── */

async function consultarUpstream(
    upstream: string,
    tope: AbortSignal,
): Promise<{ remota: string | null; fecha: string | null }> {
    const url = urlDeConsulta(upstream);
    if (!url) return { remota: null, fecha: null };
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), MS_PETICION);
    const conectarTope = (): void => controlador.abort();
    tope.addEventListener("abort", conectarTope, { once: true });
    try {
        const respuesta = await fetch(url, {
            headers: { Accept: "application/json", "User-Agent": "starseed-os-biblioteca" },
            signal: controlador.signal,
        });
        if (!respuesta.ok) return { remota: null, fecha: null };
        const json: unknown = await respuesta.json();
        const leida = leerVersion(upstream, json);
        return { remota: leida?.version ?? null, fecha: leida?.fecha ?? null };
    } catch {
        return { remota: null, fecha: null };
    } finally {
        clearTimeout(temporizador);
        tope.removeEventListener("abort", conectarTope);
    }
}

/* ── Ruta ── */

export async function GET(): Promise<Response> {
    const ahora = Date.now();
    if (caché && ahora - caché.instante < MS_CACHÉ) {
        return Response.json(caché.datos, { headers: { "Cache-Control": "no-store" } });
    }

    const registro = await leerRegistro();
    const tope = new AbortController();
    const temporizadorTotal = setTimeout(() => tope.abort(), MS_PLAZO_TOTAL);
    let registroCambió = false;

    try {
        const paquetes = REPO_DECISIONES.packages;
        const resultados = await Promise.all(
            paquetes.map(async (paquete): Promise<FuenteActualizacion> => {
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
                // Primera vez que se ve esta fuente: se registra el sha y se
                // responde «desconocida». En la siguiente pasada ya se compara
                // sha contra sha.
                const previa = registro[paquete.id] ?? null;
                const conocida = resolverInstaladaConocida(previa, remota);
                const primeraVez = conocida !== null && previa !== conocida;
                if (primeraVez && conocida) {
                    registro[paquete.id] = conocida;
                    registroCambió = true;
                }
                return {
                    ...base,
                    remota,
                    fecha,
                    estado: primeraVez ? "desconocida" : compararVersiones(previa, remota),
                };
            }),
        );
        if (registroCambió) await guardarRegistro(registro);
        const datos: Respuesta = { generado: new Date(ahora).toISOString(), fuentes: resultados };
        caché = { instante: ahora, datos };
        return Response.json(datos, { headers: { "Cache-Control": "no-store" } });
    } finally {
        clearTimeout(temporizadorTotal);
    }
}
