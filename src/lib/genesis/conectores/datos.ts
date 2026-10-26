/** GENESIS · DATOS DEL ÁMBITO PARA LA API DE CONECTORES (Ola 1019G · GCA1019Lb).
 * Cumple `DependenciasConectores` con fuentes REALES: el catálogo fusionado en memoria y
 * Supabase (`genesis_asignaciones` y `genesis_bóveda`) con cliente de servicio — la RLS real ya la
 * cruzó `guardianMando` por la capacidad del ámbito. SOLO DE SERVIDOR: usa `node:crypto` y lee la
 * bóveda cifrada; jamás devuelve `cifrado`, `iv` ni valores de claves, solo huellas. */
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient as crearClienteDeSesion } from "@/utils/supabase/server";
import { esPeticionDeEstaMaquina, estaPublicado } from "@/lib/seguridad/misma-maquina";
import { PROVEEDORES_CATALOGO } from "@/lib/mando/proveedores-catalogo";
import { FREE_CATALOG } from "@/ai/astraura/free-catalog";
import { fusionarCatalogos, type OpcionCatalogo } from "./catalogo-opciones";
import { guardarClave } from "./boveda-servidor";
import type { AsignacionAmbito, DependenciasConectores } from "./servicio";
import type { OfertaContexto } from "./escalera";

let clienteMemo: SupabaseClient | null = null;

function servicio(): SupabaseClient | null {
  if (clienteMemo) return clienteMemo;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) return null;
  return (clienteMemo = createClient(url, clave, { auth: { persistSession: false } }));
}

/** Sesión: bucle local de ESTA máquina (y de veras local) o cuenta de la sesión; anónimo → null. */
export async function cuentaConectores(req: Request): Promise<string | null> {
  if (esPeticionDeEstaMaquina(req) && !estaPublicado()) return "esta-maquina";
  try {
    const sb = await crearClienteDeSesion();
    let { data } = await sb.auth.getUser();
    if (!data.user) {
      const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
      if (token) ({ data } = await sb.auth.getUser(token));
    }
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Catálogo vivo: fusión de proveedores y fuentes gratis; «filtrado» = sin lo local (lo local entra por ofertas). */
function catalogoFusionado(): OpcionCatalogo[] {
  return fusionarCatalogos([...PROVEEDORES_CATALOGO], [...FREE_CATALOG]).filter((o) => o.privacidad !== "local");
}

async function asignacionesDe(ambitoId: string): Promise<AsignacionAmbito[]> {
  const sb = servicio();
  if (!sb) return [];
  try {
    const { data, error } = await sb.from("genesis_asignaciones").select("clave,cadena").eq("ambito_id", ambitoId);
    if (error || !data) return [];
    return data
      .map((f: { clave: unknown; cadena: unknown }): AsignacionAmbito | null => {
        if (typeof f.clave !== "string") return null;
        const cadena = Array.isArray(f.cadena) ? f.cadena.filter((i): i is string => typeof i === "string") : [];
        return { clave: f.clave, cadena };
      })
      .filter((a): a is AsignacionAmbito => a !== null);
  } catch {
    return [];
  }
}

async function vinculadasDe(ambitoId: string): Promise<Set<string>> {
  const sb = servicio();
  if (!sb) return new Set();
  try {
    const { data, error } = await sb.from("genesis_boveda").select("proveedor")
      .eq("ambito_id", ambitoId).is("revocada_en", null);
    if (error || !data) return new Set();
    return new Set(data.map((f: { proveedor: string }) => f.proveedor));
  } catch {
    return new Set();
  }
}

/** Lo local del contexto (neuronas, servidores del cerebro) lo alimenta otra tarea del contrato; aquí aún no. */
const ofertasDe = async (): Promise<OfertaContexto[]> => [];

/** Guarda la clave CIFRADA con la bóveda y responde solo su huella (la misma que guarda la bóveda). */
async function vincularConServicio(e: { ambitoId: string; proveedor: string; valor: string }): Promise<{ ok: boolean; huella?: string; error?: string }> {
  const guardado = await guardarClave(e.ambitoId, e.proveedor, e.valor, 0);
  if (!guardado.ok) return { ok: false, error: guardado.error ?? "No se pudo guardar en la bóveda." };
  return { ok: true, huella: createHash("sha256").update(e.valor).digest("hex") };
}

/** Escribe la cadena de la asignación: una fila por (ámbito, clave); la prioriza el ámbito. */
async function asignarConServicio(e: { ambitoId: string; clave: string; cadena: string[] }): Promise<{ ok: boolean; error?: string }> {
  const sb = servicio();
  if (!sb) return { ok: false, error: "Supabase no configurado en este servidor." };
  try {
    const { data } = await sb.from("genesis_asignaciones").select("id")
      .eq("ambito_id", e.ambitoId).eq("clave", e.clave).maybeSingle();
    if (data && typeof data.id === "string") {
      const { error } = await sb.from("genesis_asignaciones").update({ cadena: e.cadena }).eq("id", data.id);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }
    const { error } = await sb.from("genesis_asignaciones").insert({ ambito_id: e.ambitoId, clave: e.clave, cadena: e.cadena });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "error desconocido" };
  }
}

/** Dependencias REALES que la ruta pasa al módulo puro. */
export const CONSULTAS_SUPABASE: DependenciasConectores = {
  catalogo: async () => catalogoFusionado(),
  asignacionesDelAmbito: asignacionesDe,
  ofertasDelAmbito: ofertasDe,
  vinculadasDelAmbito: vinculadasDe,
  vincularClave: vincularConServicio,
  asignarCadena: asignarConServicio,
};
