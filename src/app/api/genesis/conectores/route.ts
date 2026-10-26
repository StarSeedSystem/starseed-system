/** GET/POST /api/genesis/conectores — API de opciones por ámbito (Ola 1019G · GCA1019Lb).
 * El criterio vive en el núcleo puro `sugerir-conector.ts`; aquí solo sesión, límite (20 cada
 * 10 min, como `/api/genesis/proponer`), permiso del ámbito (`src/lib/mando/permisos.ts`, vía
 * `mando_capacidad`) y puertos contra Supabase. Las tablas `genesis_*` aún sin aplicar degradan
 * a vacío, y NUNCA salen claves: solo proveedor, huella, ids y nombres de variables. */

import type { NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { rateLimit } from "@/lib/security/rate-limit";
import { esPeticionDeEstaMaquina } from "@/lib/seguridad/misma-maquina";
import { guardarClave } from "@/lib/genesis/conectores/boveda-servidor";
import { fusionarCatalogos, type OpcionCatalogo, type Papel } from "@/lib/genesis/conectores/catalogo-opciones";
import type { Asignacion } from "@/lib/genesis/conectores/asignaciones";
import { CONTENEDORES_OPCIONES } from "@/lib/genesis/conectores/contenedores";
import { PROVEEDORES_CATALOGO } from "@/lib/mando/proveedores-catalogo";
import { FREE_CATALOG } from "@/ai/astraura/free-catalog";
import { PAPELES_BASE, atenderGet, atenderPost, huellaValor, leerAmbito, leerCuerpo, type EstadoConectores, type PuertosConectores } from "@/lib/genesis/conectores/sugerir-conector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Catálogo fusión (proveedores-catalogo + free-catalog): estático entre peticiones. */
const catalogoFusion = (): OpcionCatalogo[] => fusionarCatalogos(PROVEEDORES_CATALOGO, FREE_CATALOG);
/* Sesión real: «esta-maquina» en la propia máquina (dueño sentado, sin sesión) o cuenta autenticada. */
async function cuentaDe(req: NextRequest): Promise<string | null> {
    if (esPeticionDeEstaMaquina(req)) return "esta-maquina";
    try {
        const supabase = await createClient();
        let { data } = await supabase.auth.getUser();
        if (!data.user) {
            const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
            if (token) ({ data } = await supabase.auth.getUser(token));
        }
        return data.user?.id ?? null;
    } catch {
        return null;
    }
}

/** Puertos contra Supabase CON la sesión de quien pide: el RLS del ámbito manda (§9 del contrato). */
async function puertosDe(estado: EstadoConectores): Promise<PuertosConectores> {
    const supabase = await createClient();
    return {
        permiso: async (cuenta) => {
            if (cuenta === "esta-maquina") return true; // la propia máquina: quien está sentado delante
            const { data, error } = await supabase.rpc("mando_capacidad", { _ambito_id: estado.ambito, capacidad: "gestionar-accesos" });
            return !error && data === true; // si no se puede comprobar, no se pasa (principio del guardián)
        },
        asignaciones: async () => {
            const { data, error } = await supabase.from("genesis_asignaciones").select("clave,cadena").eq("ambito_id", estado.ambito);
            if (error || !Array.isArray(data)) return [];
            return data.flatMap((fila): Asignacion<Papel>[] => {
                const f = fila as { clave?: unknown; cadena?: unknown };
                if (typeof f.clave !== "string" || !(PAPELES_BASE as readonly string[]).includes(f.clave) || !Array.isArray(f.cadena)) return [];
                return [{ clave: f.clave as Papel, cadena: f.cadena.filter((x): x is string => typeof x === "string"), respaldo: [],
                    preferencias: { localPrimero: true, privacidad: "desconocida", presupuesto: null } }];
            });
        },
        vinculados: async () => {
            const { data, error } = await supabase.from("genesis_boveda").select("proveedor").eq("ambito_id", estado.ambito);
            if (error || !Array.isArray(data)) return new Set<string>();
            return new Set(data.map((f) => (f as { proveedor: string }).proveedor)); // solo nombres, nunca valores
        },
        vincular: async (proveedor, valor) => {
            const r = await guardarClave(estado.ambito, proveedor, valor);
            return r.ok ? { ok: true, huella: huellaValor(valor) } : { ok: false, error: r.error ?? "No se pudo vincular." };
        },
        asignar: async (clave, cadena) => {
            try {
                const { data: u } = await supabase.auth.getUser();
                const quien = u.user?.id;
                if (!quien) return { ok: false, error: "Sesión requerida para asignar." };
                await supabase.from("genesis_asignaciones").delete().eq("ambito_id", estado.ambito).eq("clave", clave);
                const { error } = await supabase.from("genesis_asignaciones").insert({ ambito_id: estado.ambito, clave, cadena, actualizado_por: quien });
                return error ? { ok: false, error: error.message } : { ok: true };
            } catch {
                return { ok: false, error: "Error al registrar la asignación." };
            }
        },
    };
}

/** Sesión, `?ambito=`, límite común y estado: si algo ya respondió, la propia Response. */
async function apertura(req: NextRequest, aviso: string): Promise<{ cuenta: string; estado: EstadoConectores } | Response> {
    const cuenta = await cuentaDe(req);
    if (!cuenta) return Response.json({ error: aviso }, { status: 401 });
    const ambito = leerAmbito(req.nextUrl.searchParams.get("ambito"));
    if (!ambito.ok) return Response.json({ error: ambito.error }, { status: 400 });
    const limite = rateLimit(`genesis-conectores:${cuenta}`, 20, 10 * 60 * 1000);
    if (!limite.allowed) return Response.json(
        { error: `Demasiadas peticiones seguidas: vuelve a intentarlo en ${limite.retryAfterSec} s.` },
        { status: 429, headers: { "Retry-After": String(limite.retryAfterSec) } });
    return { cuenta, estado: { cuenta, ambito: ambito.ambito, catalogo: catalogoFusion(), contenedores: CONTENEDORES_OPCIONES } };
}

/** GET ?ambito= → catálogo filtrado + sugerencias de `sugerir.ts` + asignaciones del ámbito. */
export async function GET(req: NextRequest): Promise<Response> {
    const open = await apertura(req, "Inicia sesión para ver los conectores de Genesis.");
    if (open instanceof Response) return open;
    const r = await atenderGet(open.estado, await puertosDe(open.estado));
    return Response.json(r.cuerpo, { status: r.estado });
}

/** POST {accion:"vincular"|"asignar"} → bóveda (responde solo la huella) o cadena de un papel. */
export async function POST(req: NextRequest): Promise<Response> {
    const open = await apertura(req, "Inicia sesión para conectar tus servicios.");
    if (open instanceof Response) return open;
    const crudo = await req.text().catch(() => "");
    if (!crudo || crudo.length > 64 * 1024) return Response.json({ error: "Petición vacía o demasiado grande." }, { status: 400 });
    let parseado: unknown;
    try {
        parseado = JSON.parse(crudo);
    } catch {
        return Response.json({ error: "JSON inválido en el cuerpo." }, { status: 400 });
    }
    const cuerpo = leerCuerpo(parseado);
    if (!cuerpo.ok) return Response.json({ error: cuerpo.error }, { status: 400 });
    const r = await atenderPost(cuerpo.cuerpo, open.estado, await puertosDe(open.estado));
    return Response.json(r.cuerpo, { status: r.estado });
}
