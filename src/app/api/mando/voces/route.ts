/**
 * GET/POST /api/mando/voces (Ola 275 · Tarea V2 · 2026-09-07)
 * ─────────────────────────────────────────────────────────────────────────────
 * Persistencia de la «Voz del Mando»: las preferencias de anuncios hablados de
 * la orquestación y la asignación de voces por agente/personalidad. Vive en
 * `starseed_memory_root/mando/voces.json` (tolerante: si no existe se devuelven
 * los valores por defecto) vía `raizDelProyecto()`.
 *
 * El GET añade la salud del demonio de voz leída de `http://127.0.0.1:4444/status`
 * (AbortSignal.timeout(2500), null si no responde), para que el panel pinte el
 * «Demonio de voz» sin una ruta propia.
 *
 * ⚠️ Seguridad: puerta única `guardianMando`. NUNCA devuelve claves ni rutas
 * del disco; solo valores normalizados.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { guardianMando } from "@/lib/mando/guardian";
import { raizDelProyecto } from "@/lib/mando/raiz";
import {
    PREFERENCIAS_VOZ_POR_DEFECTO,
    validarPreferenciasVoz,
    type PreferenciasVozMando,
    type VozDeAgente,
} from "@/lib/mando/voz-mando";
// (Ola 275 · Tarea V5A) Importamos el catálogo puro de SERVIDOR, no `timbres.ts`
// (que es «use client»): en el bundle de servidor un módulo de cliente deja de
// ser un array y `TIMBRES.map` fallaba en el build ligero.
import { TIMBRES } from "@/lib/aurora/timbres-catalogo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ruta del archivo de preferencias dentro de la raíz del proyecto. */
function rutaArchivo(): string {
    return path.join(raizDelProyecto(), "starseed_memory_root", "mando", "voces.json");
}

/** Estado persistido del archivo (lo que falte cae al defecto). */
interface EstadoVoces {
    prefs: PreferenciasVozMando;
    vocesPorAgente: VozDeAgente[];
}

/** Ids válidos de timbre (el catálogo `TIMBRES`). */
const IDS_TIMBRE = new Set(TIMBRES.map((t) => t.id));

/** Tipos conocidos de `VozDeAgente`. */
const TIPOS_AGENTE: VozDeAgente["tipo"][] = ["escritor", "revisor", "agente158", "personalidad", "proceso"];

/**
 * Lee `voces.json` con tolerancia: cualquier campo ilegible cae al defecto y
 * nunca lanza. Devuelve el estado saneado.
 */
async function leer(): Promise<EstadoVoces> {
    const base: EstadoVoces = { prefs: PREFERENCIAS_VOZ_POR_DEFECTO, vocesPorAgente: [] };
    let crudo: unknown = null;
    try {
        crudo = JSON.parse(await readFile(rutaArchivo(), "utf-8")) as unknown;
    } catch {
        return base;
    }
    if (typeof crudo !== "object" || crudo === null || Array.isArray(crudo)) return base;
    const o = crudo as Record<string, unknown>;
    return {
        prefs: validarPreferenciasVoz(o.prefs),
        vocesPorAgente: sanearVoces(o.vocesPorAgente),
    };
}

/** Sanea una lista de `VozDeAgente`: solo las entradas válidas sobreviven. */
function sanearVoces(bruto: unknown): VozDeAgente[] {
    if (!Array.isArray(bruto)) return [];
    const salida: VozDeAgente[] = [];
    for (const v of bruto) {
        if (typeof v !== "object" || v === null) continue;
        const o = v as Record<string, unknown>;
        const id = typeof o.id === "string" ? o.id.trim() : "";
        const tipo = TIPOS_AGENTE.includes(o.tipo as VozDeAgente["tipo"]) ? (o.tipo as VozDeAgente["tipo"]) : null;
        const timbreId = typeof o.timbreId === "string" ? o.timbreId : "";
        if (!id || !tipo || !IDS_TIMBRE.has(timbreId)) continue;
        salida.push({
            id,
            tipo,
            timbreId,
            ...(typeof o.emocion === "string" && o.emocion ? { emocion: o.emocion } : {}),
        });
    }
    return salida;
}

/** Escribe el estado completo (creando el directorio si falta). Nunca lanza al llamador. */
async function escribir(estado: EstadoVoces): Promise<void> {
    const ruta = rutaArchivo();
    await mkdir(path.dirname(ruta), { recursive: true });
    await writeFile(ruta, JSON.stringify(estado, null, 2), "utf-8");
}

/**
 * Sondea el demonio de voz Astraura (`/status` en 4444). Devuelve el JSON
 * crudo si responde a tiempo, o `null` si no hay demonio. Nunca lanza.
 */
async function sondearDemonio(): Promise<unknown> {
    try {
        const resp = await fetch("http://127.0.0.1:4444/status", {
            signal: AbortSignal.timeout(2500),
            cache: "no-store",
        });
        if (!resp.ok) return null;
        const c = (await resp.json()) as unknown;
        return typeof c === "object" && c !== null ? c : null;
    } catch {
        return null;
    }
}

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    const [estado, demonio] = await Promise.all([leer(), sondearDemonio()]);
    return Response.json(
        {
            prefs: estado.prefs,
            vocesPorAgente: estado.vocesPorAgente,
            demonio,
        },
        { headers: { "Cache-Control": "no-store" } },
    );
}

export async function POST(req: Request): Promise<Response> {
    const veto = await guardianMando(req);
    if (veto) return veto;

    let cuerpo: unknown;
    try {
        cuerpo = await req.json();
    } catch {
        return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
    }
    if (typeof cuerpo !== "object" || cuerpo === null) {
        return Response.json({ error: "Cuerpo inválido." }, { status: 400 });
    }
    const o = cuerpo as Record<string, unknown>;

    const actual = await leer();
    const prefs = "prefs" in o ? validarPreferenciasVoz(o.prefs) : actual.prefs;
    const vocesPorAgente = "vocesPorAgente" in o ? sanearVoces(o.vocesPorAgente) : actual.vocesPorAgente;

    try {
        await escribir({ prefs, vocesPorAgente });
    } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido.";
        return Response.json({ error: `No se pudo guardar: ${mensaje}` }, { status: 500 });
    }

    return Response.json(
        { ok: true, prefs, vocesPorAgente },
        { headers: { "Cache-Control": "no-store" } },
    );
}