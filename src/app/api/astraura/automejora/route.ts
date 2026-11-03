/**
 * /api/astraura/automejora (MTN1027K · contrato `architecture/automejora-meta-n.md` §5).
 * Panel «Automejora» de Ajustes · Capas. SOLO LOCAL (`guardianMando` → 404 fuera).
 * Nunca devuelve claves ni rutas del disco; fuera de la Mac responde vacío sin error.
 * GET lee config, directivas y última noche. POST escribe la config o aplica `volverALaAnterior`.
 */
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { volverALaAnterior, type ArchivoDirectivas } from "@/lib/astraura/capas/directivas";
import { normalizarArchivoDirectivas } from "@/lib/astraura/capas/directivas-almacen";
import { guardianMando } from "@/lib/mando/guardian";
import { raizDelProyecto } from "@/lib/mando/raiz";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const CAPA_OK = /^[a-z0-9_-]{1,40}$/i;
const ACCIONES = new Set(["encender", "apagar", "volver", "aportar", "preguntar"]);
const esObjeto = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const base = (...partes: string[]): string => path.join(raizDelProyecto(), ...partes);
const dirDirectivas = (): string => base("starseed_memory_root", "aprendizaje", "directivas");
const rutaConfig = (): string => path.join(os.homedir(), ".starseed", "automejora.json");
const rutaNoche = (): string => base("starseed_memory_root", "aprendizaje", "automejora", "ultima-noche.json");
const sinCache = { headers: { "Cache-Control": "no-store" } };
async function leerJson(ruta: string): Promise<unknown> {
    try { return JSON.parse(await readFile(ruta, "utf-8")) as unknown; } catch { return null; }
}
interface Config { capas: Record<string, boolean>; aportar: Record<string, boolean>; preguntar: boolean; frecuencia: string; topeLlamadas: number | null; }
function leerConfig(crudo: unknown): Config {
    const c: Config = { capas: {}, aportar: {}, preguntar: false, frecuencia: "noche", topeLlamadas: null };
    if (!esObjeto(crudo)) return c;
    c.preguntar = crudo.preguntar === true;
    if (typeof crudo.frecuencia === "string" && crudo.frecuencia.trim()) c.frecuencia = crudo.frecuencia.slice(0, 20);
    if (typeof crudo.tope_llamadas === "number" && Number.isFinite(crudo.tope_llamadas)) c.topeLlamadas = crudo.tope_llamadas;
    const fuente = esObjeto(crudo.capas) ? crudo.capas : Array.isArray(crudo.capas) ? Object.fromEntries(crudo.capas.filter((c) => typeof c === "string").map((c) => [c, true])) : {};
    for (const [capa, v] of Object.entries(fuente)) {
        if (!CAPA_OK.test(capa)) continue;
        if (typeof v === "boolean") { c.capas[capa] = v; c.aportar[capa] = true; }
        else if (esObjeto(v)) { c.capas[capa] = v.encendida !== false; c.aportar[capa] = v.aportar !== false; }
    }
    return c;
}
interface Noche {
    fecha: string; donde: string | null; llamadas: number | null; motivo: string;
    propuestas: { task_id: string; titulo: string; capa: string }[];
    aprobadas: { capa: string; version: number | null; texto: string; acierto: number | null; base: number | null; n: number | null }[];
}
function leerNoche(crudo: unknown): Noche | null {
    if (!esObjeto(crudo) || Object.keys(crudo).length === 0) return null;
    const propuestas = (Array.isArray(crudo.propuestas) ? crudo.propuestas : []).filter(esObjeto).slice(0, 30)
        .map((p) => ({ task_id: texto(p.task_id, 40), titulo: texto(p.description ?? p.titulo, 120), capa: texto(p.capa, 40) }));
    const aprobadas = (Array.isArray(crudo.directivas) ? crudo.directivas : []).filter(esObjeto).slice(0, 30)
        .map((d) => ({ capa: texto(d.capa, 40), version: numero(d.version), texto: texto(d.texto, 1200), acierto: numero(d.acierto), base: numero(d.base), n: numero(d.n) }));
    const donde = texto(crudo.donde ?? crudo.donde_corrio ?? crudo.host ?? crudo.nodo, 80);
    return { fecha: texto(crudo.fecha ?? crudo.ultima_noche, 40), donde: donde || null, motivo: texto(crudo.motivo, 300), llamadas: numero(crudo.llamadas ?? crudo.llamadas_usadas), propuestas, aprobadas };
}
async function foto() {
    const [crudoConfig, crudoNoche] = await Promise.all([leerJson(rutaConfig()), leerJson(rutaNoche())]);
    const directivas: Record<string, ArchivoDirectivas> = {};
    try {
        for (const e of await readdir(dirDirectivas(), { withFileTypes: true })) {
            const capa = e.name.slice(0, -5);
            if (!e.isFile() || !e.name.endsWith(".json") || !CAPA_OK.test(capa)) continue;
            const archivo = normalizarArchivoDirectivas(await leerJson(path.join(dirDirectivas(), e.name)));
            if (archivo) directivas[capa] = archivo;
        }
    } catch { /* sin carpeta de directivas: la foto sigue vacía */ }
    return { vacio: crudoConfig === null && crudoNoche === null && Object.keys(directivas).length === 0, config: leerConfig(crudoConfig), directivas, ultimaNoche: leerNoche(crudoNoche) };
}
async function escribirJson(ruta: string, datos: unknown): Promise<void> {
    await mkdir(path.dirname(ruta), { recursive: true });
    const temporal = `${ruta}.tmp`;
    await writeFile(temporal, JSON.stringify(datos, null, 1), "utf-8");
    await rename(temporal, ruta);
}
export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    return Response.json(await foto(), sinCache);
}
export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    let cuerpo: Record<string, unknown>;
    try {
        const crudo = (await peticion.json()) as unknown;
        if (!esObjeto(crudo)) throw new Error("no-objeto");
        cuerpo = crudo;
    } catch {
        return Response.json({ ok: false, error: "Cuerpo JSON inválido." }, { status: 400 });
    }
    const capa = typeof cuerpo.capa === "string" ? cuerpo.capa.trim() : "";
    const accion = typeof cuerpo.accion === "string" ? cuerpo.accion : "";
    if (!CAPA_OK.test(capa) || !ACCIONES.has(accion)) return Response.json({ ok: false, error: "Capa o acción no válida." }, { status: 400 });
    const valor = typeof cuerpo.valor === "boolean" ? cuerpo.valor : undefined;
    if (accion === "volver") {
        const ruta = path.join(dirDirectivas(), `${capa}.json`);
        const archivo = normalizarArchivoDirectivas(await leerJson(ruta));
        if (!archivo) return Response.json({ ok: false, error: "No hay directivas para esa capa." }, { status: 404 });
        await escribirJson(ruta, volverALaAnterior(archivo));
        return Response.json({ ok: true, ...(await foto()) }, sinCache);
    }
    const crudo = await leerJson(rutaConfig());
    const config = esObjeto(crudo) ? { ...crudo } : {};
    if (accion === "preguntar") {
        config.preguntar = valor ?? !(config.preguntar === true);
    } else {
        const capas = esObjeto(config.capas) ? { ...config.capas } : {};
        const previa = esObjeto(capas[capa]) ? { ...capas[capa] } : {};
        if (accion === "encender") previa.encendida = true;
        if (accion === "apagar") previa.encendida = false;
        if (accion === "aportar") previa.aportar = valor ?? true;
        capas[capa] = previa;
        config.capas = capas;
    }
    await escribirJson(rutaConfig(), config);
    return Response.json({ ok: true, ...(await foto()) }, sinCache);
}
