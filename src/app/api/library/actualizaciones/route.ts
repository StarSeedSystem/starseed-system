// ════════════════════════════════════════════════════════════════════════════
// Consulta sin claves los upstream públicos de la Biblioteca.
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { REPO_DECISIONES } from "@/lib/library/fuentes-decision";
import { FICHAS_IA_LOCALES, fichasIaConUpstreamGitHub } from "@/lib/library/fuentes-ia-locales";
import { FICHAS_REPOS_OS } from "@/lib/library/repos-os";
import { FICHAS_REPOS_1025, FICHAS_VIEJAS_SEGUIMIENTO_1025 } from "@/lib/library/repos-1025";
import { FICHAS_REPOS_1026, FICHAS_VIEJAS_SEGUIMIENTO_1026 } from "@/lib/library/repos-1026";
import { FICHAS_REPOS_1027 } from "@/lib/library/repos-1027";
import { FICHAS_REPOS_1027B } from "@/lib/library/repos-1027b";
import { FICHAS_REPOS_1028 } from "@/lib/library/repos-1028";
import { FICHAS_REPOS_1101 } from "@/lib/library/repos-1101";
import { FICHAS_REPOS_1104 } from "@/lib/library/repos-1104";
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
import {
    loteAConsultar,
    fusionar,
    type ConocidasActualizacion,
    type ResultadoConsulta,
} from "@/lib/library/rotacion-actualizaciones";
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

/** Upstream de GitHub con dueño y repo: lo único que la ruta puede consultar. */
const RE_UPSTREAM_GITHUB = /^https?:\/\/github\.com\/[^/\s]+\/[^/\s]+/;

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

const EDAD_MIN_MS = 15 * 60 * 1000;
const LOTE_SIN_TOKEN = 40;
const LOTE_CON_TOKEN = 300;
const CONCURRENCIA = 6;
const RUTA_CONOCIDAS = path.join(os.tmpdir(), "starseed-actualizaciones-biblioteca.json");

function cargarConocidas(): ConocidasActualizacion {
    try {
        const leído: unknown = JSON.parse(readFileSync(RUTA_CONOCIDAS, "utf8"));
        return typeof leído === "object" && leído !== null && !Array.isArray(leído)
            ? (leído as ConocidasActualizacion)
            : {};
    } catch {
        return {};
    }
}

function guardarConocidas(): void {
    try {
        writeFileSync(RUTA_CONOCIDAS, JSON.stringify(conocidas), "utf8");
    } catch {
        // En Vercel puede no haber disco escribible: la memoria basta.
    }
}

let conocidas: ConocidasActualizacion = cargarConocidas();

/* ── Consulta de un upstream ── */

interface LecturaUpstream {
    remota: string | null;
    fecha: string | null;
    error: string | null;
    limite: boolean;
}

async function consultarUpstream(
    upstream: string,
    payload: PayloadActualizacion | undefined,
    tope: AbortSignal,
): Promise<LecturaUpstream> {
    const traslado = rutaTrasladoCodeberg(payload?.trasladadoA);
    if (traslado) {
        const leída = await consultarCodeberg(
            payload?.trasladadoA,
            (url, init) => fetch(url, { ...init, signal: tope }),
        );
        return { remota: leída.version, fecha: leída.fecha, error: leída.error, limite: false };
    }
    const url = urlDeConsulta(upstream, payload);
    if (!url) return { remota: null, fecha: null, error: null, limite: false };
    try {
        const headers: Record<string, string> = {
            Accept: "application/json",
            "User-Agent": "starseed-os-biblioteca",
        };
        // El token es opcional y NUNCA se escribe en la respuesta, un log ni un error.
        if (url.startsWith("https://api.github.com/") && process.env.GITHUB_TOKEN) {
            headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
        }
        const respuesta = await fetch(url, { headers, signal: tope });
        if (!respuesta.ok) {
            const limite =
                (respuesta.status === 403 || respuesta.status === 429) &&
                respuesta.headers.get("x-ratelimit-remaining") === "0";
            return { remota: null, fecha: null, error: null, limite };
        }
        const json: unknown = await respuesta.json();
        const leida = leerVersion(upstream, json, payload);
        return {
            remota: leida?.version ?? null,
            fecha: leida?.fecha ?? null,
            error: null,
            limite: false,
        };
    } catch {
        return { remota: null, fecha: null, error: null, limite: false };
    }
}

/** Consulta el lote con concurrencia acotada y se detiene al agotar el límite. */
async function consultarPendientes(
    pendientes: EntradaFuente[],
    tope: AbortSignal,
): Promise<{ leídas: Map<string, LecturaUpstream>; limite: boolean }> {
    const leídas = new Map<string, LecturaUpstream>();
    let limite = false;
    let siguiente = 0;
    const trabajadores = Array.from(
        { length: Math.min(CONCURRENCIA, pendientes.length) },
        async () => {
            while (!limite && !tope.aborted && siguiente < pendientes.length) {
                const entrada = pendientes[siguiente];
                siguiente += 1;
                const leída = await consultarUpstream(entrada.upstream, entrada.payload, tope);
                leídas.set(entrada.id, leída);
                if (leída.limite) limite = true;
            }
        },
    );
    await Promise.all(trabajadores);
    return { leídas, limite };
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
        const seguibles = fichasIaConUpstreamGitHub([
            ...FICHAS_IA_LOCALES,
            ...FICHAS_REPOS_OS,
            ...FICHAS_REPOS_1025,
            ...FICHAS_VIEJAS_SEGUIMIENTO_1025,
            ...FICHAS_REPOS_1026,
            ...FICHAS_VIEJAS_SEGUIMIENTO_1026,
            ...FICHAS_REPOS_1027,
            ...FICHAS_REPOS_1027B,
            ...FICHAS_REPOS_1028,
            ...FICHAS_REPOS_1101,
        ]).filter((p) => !idsDecisiones.has(p.id));
        const idsSeguibles = new Set(seguibles.map((p) => p.id));
        // Las herramientas de la tanda 1027 (OpenMausBot, Insomnia) se pintan como `app`
        // porque el cargador de tipos solo conoce los tipos de la Biblioteca, y el filtro
        // por tipo las descartaría. Se recuperan por su upstream de GitHub para que sigan
        // su versión, como manda el contrato (architecture/mausbot-astraura.md).
        // (1104 · AF) Lo mismo para la 1101 (keepalive) y la 1104: también se pintan como `app`
        // y el filtro de tipos las dejaba sin seguir su versión.
        const tanda1027 = [...FICHAS_REPOS_1027, ...FICHAS_REPOS_1101, ...FICHAS_REPOS_1104].filter(
            (p) =>
                !idsDecisiones.has(p.id) &&
                !idsSeguibles.has(p.id) &&
                typeof p.payload?.upstream === "string" &&
                RE_UPSTREAM_GITHUB.test(p.payload.upstream),
        );
        const fichas = [
            ...REPO_DECISIONES.packages,
            // Tanda 1025: las 26 nuevas y las 3 fichas viejas (iatool-*) que ahora siguen su repo real.
            // Tanda 1026: las 4 nuevas y Open Generative AI (iatool-*), que sigue el suyo.
            // Tanda 1027: OpenMausBot, Insomnia y Colibri, por etiquetas vX.Y.Z.
            // Tanda 1027b: Meta^n por commits y Memvid por etiquetas vX.Y.Z.
            // Tanda 1028: LEANN por etiquetas vX.Y.Z.
            // Tanda 1101: keepalive por etiquetas vX.Y.Z.
            // Tanda 1104: EGM, MotionSites y DeepTutor por releases, OpenUI por la etiqueta de react-lang
            // y BAMA por commits (recuperadas por su upstream, como la 1027).
            ...seguibles,
            ...tanda1027,
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
        // Solo se consulta el lote rotatorio; del resto se devuelve lo último bueno.
        const idsLote = loteAConsultar(entradas, conocidas, ahora, {
            maxLote: process.env.GITHUB_TOKEN ? LOTE_CON_TOKEN : LOTE_SIN_TOKEN,
            edadMinMs: EDAD_MIN_MS,
        });
        const porId = new Set(idsLote);
        const pendientes = entradas.filter((entrada) => porId.has(entrada.id));
        const { leídas, limite } = await consultarPendientes(pendientes, tope.signal);
        const resultados: ResultadoConsulta[] = [...leídas.entries()].map(([id, leída]) => ({
            id,
            remota: leída.remota,
            fecha: leída.fecha,
        }));
        conocidas = fusionar(conocidas, resultados, ahora);
        guardarConocidas();
        const fuentes = entradas.map((entrada): FuenteActualizacion => {
            const guardada = conocidas[entrada.id];
            const leída = leídas.get(entrada.id);
            const patronTag = entrada.payload?.patronTag;
            const avisoPatron =
                patronTag === undefined || patronTag === null
                    ? null
                    : validarPatronTag(patronTag).error;
            const aviso =
                avisoPatron ??
                leída?.error ??
                (limite && porId.has(entrada.id) && !leída
                    ? "GitHub agotó el límite de consultas; se reintentará en la próxima pasada."
                    : null);
            return {
                id: entrada.id,
                instalada: entrada.instalada,
                remota: guardada?.remota ?? null,
                estado: guardada?.remota
                    ? compararVersiones(entrada.instalada, guardada.remota)
                    : "desconocida",
                fecha: guardada?.fecha ?? null,
                upstream: entrada.upstream,
                aviso,
            };
        });
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
