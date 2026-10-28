// GENESIS · CONECTORES · DATOS Y SUGERENCIAS (servidor). Nunca devuelve valores de claves: vincular responde solo la huella.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@/utils/supabase/server";
import { raizDelProyecto } from "@/lib/mando/raiz";
import {
  DESARROLLADORES_INICIALES, puede, rolDe,
  type Capacidad, type Genesis, type Invitacion, type Rol,
} from "@/lib/mando/permisos";
import { PROVEEDORES_CATALOGO } from "@/lib/mando/proveedores-catalogo";
import { FREE_CATALOG } from "@/ai/astraura/free-catalog";
import { fusionarCatalogos, type OpcionCatalogo, type Papel } from "./catalogo-opciones";
import { CONTENEDORES_OPCIONES } from "./contenedores";
import { guardarClave } from "./boveda-servidor";
import { sugerirParaAmbito, type GrupoSugerencias } from "./sugerir";
import type { Asignacion } from "./asignaciones";
import {
  aAsignacionMando, aAsignacionPublica, catalogoPublico, huellaDeValor,
  type AsignacionPublica, type OpcionPublica,
} from "./vacio";

export interface CuentaSesion { id: string; correo: string | null }
export interface OpcionesDelAmbito {
  catalogo: OpcionPublica[]; sugerencias: GrupoSugerencias[]; asignaciones: AsignacionPublica[];
}
export interface ResultadoVinculo { huella?: string; error?: string }
export interface ResultadoAsignacion { ok: boolean; error?: string }

type Fila = { clave?: unknown; cadena?: unknown };

export function catalogoBase(): OpcionCatalogo[] {
  return fusionarCatalogos(PROVEEDORES_CATALOGO, FREE_CATALOG);
}

/** Permiso `usar-apis`; una cuenta nueva no se bloquea aquí: la juzga el guardián. */
export function permiteConRegistro(correo: string, registro: Genesis): boolean {
  const rol: Rol = rolDe(correo, registro, DESARROLLADORES_INICIALES);
  if (rol === "ninguno") return true;
  const alcance: readonly Capacidad[] | undefined = registro.invitaciones
    ?.find((i) => i.vigente && i.correo.toLowerCase() === correo.toLowerCase())?.capacidades;
  return puede(rol, "usar-apis", alcance);
}

function rutaRegistro(): string {
  return path.join(raizDelProyecto(), "starseed_memory_root", "mando", "accesos.json");
}

async function leerRegistro(): Promise<Genesis> {
  try {
    const crudo: unknown = JSON.parse(await readFile(rutaRegistro(), "utf-8"));
    const r = crudo as { dueno?: unknown; invitaciones?: unknown };
    if (typeof r.dueno !== "string") throw new Error("registro sin dueño");
    const lista = Array.isArray(r.invitaciones) ? (r.invitaciones as unknown[]) : [];
    const invitaciones = lista.filter((i): i is Invitacion => typeof i === "object" && i !== null
      && typeof (i as { correo?: unknown }).correo === "string");
    return { dueno: r.dueno, invitaciones };
  } catch {
    return { dueno: process.env.STARSEED_DUENO ?? "alex@star.seed", invitaciones: [] };
  }
}
export async function permiteUsarApis(cuenta: CuentaSesion): Promise<boolean> {
  if (!cuenta.correo) return false;
  return permiteConRegistro(cuenta.correo, await leerRegistro());
}
export async function cargarOpciones(ambito: string): Promise<OpcionesDelAmbito> {
  const catalogo = catalogoBase();
  let filas: Fila[] = [];
  let vinculadas = new Set<string>();
  try {
    const sb = await createClient();
    const [asig, boveda] = await Promise.all([
      sb.from("genesis_asignaciones").select("clave,cadena"),
      sb.from("genesis_boveda").select("proveedor"),
    ]);
    filas = (Array.isArray(asig.data) ? asig.data : []) as Fila[];
    const proveedores = (Array.isArray(boveda.data) ? boveda.data : []) as { proveedor?: unknown }[];
    vinculadas = new Set(proveedores.flatMap((f) => (typeof f.proveedor === "string" ? [f.proveedor] : [])));
  } catch {
    // Tablas `genesis_*` sin aplicar en esta instancia: se responde con el catálogo público.
  }

  const mando = filas.map(aAsignacionMando).filter((a): a is Asignacion<Papel> => a !== null);
  const publicas = filas.map(aAsignacionPublica).filter((a): a is AsignacionPublica => a !== null);
  const sugerencias = sugerirParaAmbito({
    asignaciones: mando, catalogo, ofertas: [], vinculadas, contenedores: CONTENEDORES_OPCIONES,
  });
  return { catalogo: catalogoPublico(catalogo, vinculadas, mando), sugerencias, asignaciones: publicas };
}
export async function guardarEnBoveda(
  ambito: string, proveedor: string, valor: string,
): Promise<ResultadoVinculo> {
  const r = await guardarClave(ambito, proveedor, valor);
  if (!r.ok) return { error: r.error ?? "No se pudo guardar en la bóveda." };
  return { huella: await huellaDeValor(valor) };
}
export async function asignarClave(
  ambito: string, clave: string, cadena: string[], cuenta: CuentaSesion,
): Promise<ResultadoAsignacion> {
  try {
    const sb = await createClient();
    const { data, error } = await sb
      .from("genesis_asignaciones")
      .select("id")
      .eq("ambito_id", ambito)
      .eq("clave", clave)
      .maybeSingle();
    if (error) return { ok: false, error: "No se pudo leer la asignación." };
    const id = (data as { id?: unknown } | null)?.id;
    const r = typeof id === "string"
      ? await sb.from("genesis_asignaciones").update({ cadena, actualizado_por: cuenta.id }).eq("id", id)
      : await sb.from("genesis_asignaciones")
        .insert({ ambito_id: ambito, clave, cadena, actualizado_por: cuenta.id });
    return r.error ? { ok: false, error: "No se pudo guardar la asignación." } : { ok: true };
  } catch {
    return { ok: false, error: "No se pudo guardar la asignación." };
  }
}
