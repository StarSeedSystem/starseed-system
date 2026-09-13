/**
 * POST /api/mando/director/accion (Ola 318 · p318E) — acciones reales:
 *   · reiniciar_servicio {nombre} → `launchctl kickstart -k` (allowlist)
 *   · apartar_proveedor {proveedor, horas?} / reactivar_proveedor {proveedor}
 *     → edita `~/.starseed/salud-proveedores.json` (sin tocar `claves_agotadas`)
 *   · pausar_vigilante / reanudar_vigilante → `pausado` en director-config.json
 * ⚠️ `guardianMando` como puerta única. Nombre/proveedor siempre contra lista
 * blanca o regex. Respuesta siempre `{ ok, detalle }`, sin rutas ni claves.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { guardianMando } from "@/lib/mando/guardian";
import { raizDelProyecto } from "@/lib/mando/raiz";
import { DEFAULTS, fusionar } from "@/lib/mando/director-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const execFileAsync = promisify(execFile);
const SERVICIOS_PERMITIDOS = ["vigilante", "director", "guardia", "eco", "ecoides", "telegram", "mando"] as const;
const RE_PROVEEDOR = /^[a-z0-9_-]{2,32}$/;
interface Resultado { ok: boolean; detalle: string }
type Respuesta = { estado: number; cuerpo: Resultado };

function esObjeto(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
async function leerJson(ruta: string): Promise<Record<string, unknown>> {
    try {
        const crudo = JSON.parse(await readFile(ruta, "utf-8")) as unknown;
        return esObjeto(crudo) ? crudo : {};
    } catch { return {}; }
}
async function escribirAtomico(ruta: string, datos: unknown): Promise<void> {
    await mkdir(path.dirname(ruta), { recursive: true });
    const temporal = `${ruta}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporal, `${JSON.stringify(datos, null, 2)}\n`, "utf-8");
    await rename(temporal, ruta);
}
// «YYYY-MM-DD HH:MM:SS» en hora local, igual que `ahora()` del orquestador Python.
function horaLocal(masHoras = 0): string {
    const f = new Date(Date.now() + masHoras * 3_600_000);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${f.getFullYear()}-${p(f.getMonth() + 1)}-${p(f.getDate())} ${p(f.getHours())}:${p(f.getMinutes())}:${p(f.getSeconds())}`;
}
function rutaSalud(): string { return path.join(os.homedir(), ".starseed", "salud-proveedores.json"); }
function rutaConfigDirector(): string { return path.join(raizDelProyecto(), "starseed_memory_root", "mando", "director-config.json"); }
async function reiniciarServicio(nombre: unknown): Promise<Respuesta> {
    if (typeof nombre !== "string" || !(SERVICIOS_PERMITIDOS as readonly string[]).includes(nombre)) {
        return { estado: 400, cuerpo: { ok: false, detalle: "Servicio no permitido." } };
    }
    const uid = typeof process.getuid === "function" ? process.getuid() : 501;
    try {
        await execFileAsync("launchctl", ["kickstart", "-k", `gui/${uid}/com.starseed.${nombre}`], { timeout: 10_000 });
        return { estado: 200, cuerpo: { ok: true, detalle: `Servicio «${nombre}» reiniciado.` } };
    } catch {
        return { estado: 500, cuerpo: { ok: false, detalle: `No se pudo reiniciar el servicio «${nombre}».` } };
    }
}
async function tocarProveedor(proveedor: unknown, tocar: (e: Record<string, unknown>) => void, verbo: string): Promise<Respuesta> {
    if (typeof proveedor !== "string" || !RE_PROVEEDOR.test(proveedor)) {
        return { estado: 400, cuerpo: { ok: false, detalle: "Nombre de proveedor no válido." } };
    }
    try {
        const ruta = rutaSalud();
        const salud = await leerJson(ruta);
        const entrada = esObjeto(salud[proveedor]) ? { ...salud[proveedor] } : {};
        tocar(entrada);
        salud[proveedor] = entrada;
        await escribirAtomico(ruta, salud);
        return { estado: 200, cuerpo: { ok: true, detalle: `Proveedor «${proveedor}» ${verbo}.` } };
    } catch {
        return { estado: 500, cuerpo: { ok: false, detalle: "No se pudo actualizar la salud del proveedor." } };
    }
}
async function pausarVigilante(pausado: boolean): Promise<Respuesta> {
    try {
        const ruta = rutaConfigDirector();
        const base = fusionar(DEFAULTS, await leerJson(ruta));
        await escribirAtomico(ruta, { ...base, pausado });
        return { estado: 200, cuerpo: { ok: true, detalle: pausado ? "Vigilante en pausa." : "Vigilante reanudado." } };
    } catch {
        return { estado: 500, cuerpo: { ok: false, detalle: "No se pudo actualizar el estado del vigilante." } };
    }
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    let cuerpo: Record<string, unknown>;
    try {
        const crudo = (await peticion.json()) as unknown;
        cuerpo = esObjeto(crudo) ? crudo : {};
    } catch {
        return Response.json({ ok: false, detalle: "Cuerpo JSON inválido." }, { status: 400 });
    }
    const accion = typeof cuerpo.accion === "string" ? cuerpo.accion : "";
    const horas = typeof cuerpo.horas === "number" && Number.isFinite(cuerpo.horas) && cuerpo.horas > 0 ? cuerpo.horas : 24;
    let r: Respuesta;
    if (accion === "reiniciar_servicio") {
        r = await reiniciarServicio(cuerpo.nombre);
    } else if (accion === "apartar_proveedor") {
        r = await tocarProveedor(cuerpo.proveedor, (e) => {
            e.estado = "caido"; e.sin_cupo_hasta = horaLocal(horas); e.motivo = "apartado desde el Mando"; e.t = horaLocal();
        }, "apartado");
    } else if (accion === "reactivar_proveedor") {
        r = await tocarProveedor(cuerpo.proveedor, (e) => {
            e.estado = "vivo"; delete e.sin_cupo_hasta; delete e.motivo;
        }, "reactivado");
    } else if (accion === "pausar_vigilante") {
        r = await pausarVigilante(true);
    } else if (accion === "reanudar_vigilante") {
        r = await pausarVigilante(false);
    } else {
        r = { estado: 400, cuerpo: { ok: false, detalle: "Acción no reconocida." } };
    }
    return Response.json(r.cuerpo, { status: r.estado, headers: { "Cache-Control": "no-store" } });
}
