/**
 * GET/PUT /api/mando/director/config (Ola 318 · p318E)
 * ─────────────────────────────────────────────────────────────────────────
 * Lee y guarda `starseed_memory_root/mando/director-config.json`: los
 * ajustes que `scripts/puente/config_director.py` carga en cada pasada del
 * director. GET: si el archivo falta o está corrupto, `origen: "defaults"`;
 * si no, se fusiona sobre `DEFAULTS` (tolerante, como `cargar()`). PUT:
 * valida el cuerpo con `validar`, lo fusiona sobre lo ya guardado (no sobre
 * `DEFAULTS`: un campo omitido conserva su valor actual) y escribe atómico
 * (temporal en la misma carpeta + `rename`).
 *
 * ⚠️ Seguridad: puerta única `guardianMando`. Nunca devuelve la ruta
 * absoluta del archivo ni claves; los errores de escritura son genéricos.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { guardianMando } from "@/lib/mando/guardian";
import { raizDelProyecto } from "@/lib/mando/raiz";
import { DEFAULTS, fusionar, validar, type ConfigDirector } from "@/lib/mando/director-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function rutaConfig(): string {
    return path.join(raizDelProyecto(), "starseed_memory_root", "mando", "director-config.json");
}

function esObjeto(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** JSON crudo del archivo, o `null` si falta o no parsea. */
async function leerCrudo(ruta: string): Promise<unknown> {
    try {
        return JSON.parse(await readFile(ruta, "utf-8")) as unknown;
    } catch {
        return null;
    }
}

/** Escritura atómica: temporal en la misma carpeta + `rename`; crea la carpeta si falta. */
async function escribirAtomico(ruta: string, datos: unknown): Promise<void> {
    await mkdir(path.dirname(ruta), { recursive: true });
    const temporal = `${ruta}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporal, `${JSON.stringify(datos, null, 2)}\n`, "utf-8");
    await rename(temporal, ruta);
}

/** `pausado` vive en el mismo archivo (lo escribe `accion/route.ts`); no es parte de `ConfigDirector`. */
function pausadoDe(crudo: unknown): boolean {
    return esObjeto(crudo) ? Boolean(crudo.pausado) : false;
}

interface RespuestaConfig {
    config: ConfigDirector;
    pausado: boolean;
    origen: "defaults" | "archivo";
    actualizadoEn: string;
}

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    const crudo = await leerCrudo(rutaConfig());
    const cuerpo: RespuestaConfig = esObjeto(crudo)
        ? { config: fusionar(DEFAULTS, crudo), pausado: pausadoDe(crudo), origen: "archivo", actualizadoEn: new Date().toISOString() }
        : { config: DEFAULTS, pausado: false, origen: "defaults", actualizadoEn: new Date().toISOString() };

    return Response.json(cuerpo, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    let cuerpo: unknown;
    try {
        cuerpo = await peticion.json();
    } catch {
        return Response.json({ ok: false, errores: ["Cuerpo JSON inválido."] }, { status: 400 });
    }

    const resultado = validar(cuerpo);
    if (!resultado.ok) {
        return Response.json({ ok: false, errores: resultado.errores }, { status: 400 });
    }

    const ruta = rutaConfig();
    const existenteCrudo = await leerCrudo(ruta);
    const existente = esObjeto(existenteCrudo) ? fusionar(DEFAULTS, existenteCrudo) : DEFAULTS;
    const pausado = pausadoDe(existenteCrudo);
    const final = fusionar(existente, cuerpo);

    try {
        await escribirAtomico(ruta, { ...final, pausado });
    } catch {
        return Response.json({ ok: false, errores: ["No se pudo guardar la configuración."] }, { status: 500 });
    }

    return Response.json(
        { ok: true, config: final, pausado, actualizadoEn: new Date().toISOString() },
        { headers: { "Cache-Control": "no-store" } },
    );
}
