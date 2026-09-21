/**
 * GET/POST /api/mando/accesos (Ola 332 · CU3c · Ajustes del Mando).
 * GET: cuentas visibles, quién está conectado y servicios (solo el NOMBRE de
 * la variable y su uso, jamás el valor). POST concede o retira y devuelve el
 * MISMO payload completo que el GET (contrato único, sin recarga en cliente).
 * El permiso se comprueba aquí en servidor (guardian + sesión + rolDe/puede);
 * sin permiso, 403 genérico que no revela qué existe. Registro en
 * `starseed_memory_root/mando/accesos.json`, renombrado atómico. Deuda: la
 * lectura→escritura no es atómica entre POST simultáneos (un admin: se acepta).
 */
import { rename, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { guardianMando } from "@/lib/mando/guardian";
import { esDespliegueLocal } from "@/lib/aurora/voz-starseed/puerta-local";
import { leerEstadoDeIdes } from "@/lib/mando/ides";
import { DESARROLLADORES_INICIALES, puede, rolDe,
    type Capacidad, type Invitacion, type Mando, type Rol } from "@/lib/mando/permisos";
import { raizDelProyecto } from "@/lib/mando/raiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface CuentaAcceso { correo: string; rol: Rol; capacidades: readonly Capacidad[]; }
export interface ServicioAcceso { variable: string; uso: string; }
export interface DatosAccesos {
    quienPide: string; cuentas: CuentaAcceso[];
    conectados: readonly string[]; servicios: ServicioAcceso[];
}
interface RegistroAccesos extends Mando { servicios?: readonly ServicioAcceso[]; }
const RUTA = (): string =>
    path.join(raizDelProyecto(), "starseed_memory_root", "mando", "accesos.json");
async function leerRegistro(): Promise<RegistroAccesos> {
    try {
        const b = JSON.parse(await readFile(RUTA(), "utf-8")) as RegistroAccesos;
        if (typeof b.dueno !== "string") throw new Error("registro sin dueño");
        return { dueno: b.dueno,
            invitaciones: Array.isArray(b.invitaciones) ? b.invitaciones : [],
            servicios: Array.isArray(b.servicios) ? b.servicios : [] };
    } catch {
        return { dueno: process.env.STARSEED_DUENO ?? "alex@star.seed",
            invitaciones: [], servicios: [] };
    }
}
async function guardarRegistro(r: RegistroAccesos): Promise<void> {
    await mkdir(path.dirname(RUTA()), { recursive: true });
    const temporal = `${RUTA()}.tmp`;
    await writeFile(temporal, `${JSON.stringify(r, null, 2)}\n`, "utf-8");
    await rename(temporal, RUTA());
}
/** Correo de quien pide: sesión verificada, nunca lo que diga el cliente. */
async function correoQuePide(req: Request, dueno: string): Promise<string> {
    if (process.env.NODE_ENV !== "production" || esDespliegueLocal(req)) return dueno;
    const { createClient } = await import("@/utils/supabase/server");
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    return error || !data.user?.email ? "" : data.user.email;
}
async function construirDatos(quien: string, r: RegistroAccesos): Promise<DatosAccesos> {
    const correos = new Set<string>([r.dueno, ...DESARROLLADORES_INICIALES]);
    for (const i of r.invitaciones ?? []) if (i.vigente) correos.add(i.correo);
    const todas: readonly Capacidad[] = ["ver", "editar-perfil", "lanzar-olas",
        "publicar", "editar-codigo", "gestionar-accesos", "usar-apis"];
    const cuentas: CuentaAcceso[] = [...correos].map((correo) => {
        const rol = rolDe(correo, r, DESARROLLADORES_INICIALES);
        const alcance = r.invitaciones?.find((i) => i.vigente && i.correo === correo)?.capacidades;
        return { correo, rol, capacidades: todas.filter((c) => puede(rol, c, alcance)) };
    });
    const conectados = (await leerEstadoDeIdes())
        .filter((i) => i.frescura === "al día").map((i) => i.nombre);
    return { quienPide: quien, cuentas, conectados, servicios: [...(r.servicios ?? [])] };
}

const VETO = Response.json({ error: "No puedes usar esta consola." }, { status: 403 });
const SIN_CACHE = { headers: { "Cache-Control": "no-store" } } as const;

async function rolDeLaPeticion(req: Request): Promise<{ quien: string; r: RegistroAccesos; rol: Rol }> {
    const r = await leerRegistro();
    const quien = await correoQuePide(req, r.dueno);
    return { quien, r, rol: rolDe(quien, r, DESARROLLADORES_INICIALES) };
}

/** GET: payload completo para quien pregunta. */
export async function GET(req: Request): Promise<Response> {
    const veto = await guardianMando(req);
    if (veto) return veto;
    const { quien, r, rol } = await rolDeLaPeticion(req);
    if (!puede(rol, "ver")) return VETO;
    return Response.json(await construirDatos(quien, r), SIN_CACHE);
}

/** POST: concede/retira y devuelve el payload completo (como el GET). */
export async function POST(req: Request): Promise<Response> {
    const veto = await guardianMando(req);
    if (veto) return veto;
    const { quien, r, rol } = await rolDeLaPeticion(req);
    if (!puede(rol, "gestionar-accesos")) return VETO;
    let c: { accion?: string; correo?: string; variable?: string; uso?: string };
    try { c = (await req.json()) as typeof c; }
    catch { return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 }); }

    const inv: Invitacion[] = [...(r.invitaciones ?? [])];
    const correo = typeof c.correo === "string" ? c.correo.trim().toLowerCase() : "";
    if (c.accion === "conceder" && correo.includes("@")) {
        const i = inv.findIndex((x) => x.correo === correo);
        const nueva: Invitacion = { correo, vigente: true, capacidades: ["ver"] };
        if (i >= 0) inv[i] = nueva; else inv.push(nueva);
        r.invitaciones = inv;
    } else if (c.accion === "retirar" && correo.includes("@")) {
        const i = inv.findIndex((x) => x.correo === correo && x.vigente);
        if (i < 0) return Response.json({ error: "No hay acceso que retirar." }, { status: 400 });
        inv[i] = { ...inv[i], vigente: false };
        r.invitaciones = inv;
    } else if (c.accion === "conceder-servicio" && c.variable && c.uso) {
        r.servicios = [...(r.servicios ?? []).filter((s) => s.variable !== c.variable),
            { variable: c.variable.trim(), uso: c.uso.trim() }];
    } else if (c.accion === "retirar-servicio" && c.variable) {
        r.servicios = (r.servicios ?? []).filter((s) => s.variable !== c.variable);
    } else {
        return Response.json({ error: "Acción o datos no válidos." }, { status: 400 });
    }
    await guardarRegistro(r);
    return Response.json(await construirDatos(quien, r), SIN_CACHE);
}
