"use client";

/*
 * MetaGeminis · lectura y decisiones sobre las tablas de la migración 20261011090000_metageminis.sql.
 * Las políticas de la base solo dejan leer a los miembros de MetaGenesis (public.es_metagenesis()) y solo
 * dejan aprobar o descartar a los dueños, mediante dos RPC que fuerzan las transiciones válidas. Nada lanza:
 * si una tabla aún no existe (la migración está sin aplicar), se dice con claridad en `sinTabla`.
 */

import { createClient } from "@/utils/supabase/client";
import type { AgenteMeta, Borrador, Campana, Donacion, EnlacePago, Hallazgo, Pieza, Resultado } from "./tipos";

export interface DatosMeta {
  borradores: Borrador[];
  piezas: Pieza[];
  campanas: Campana[];
  resultados: Resultado[];
  donaciones: Donacion[];
  enlaces: EnlacePago[];
  agentes: AgenteMeta[];
  hallazgos: Hallazgo[];
}

export type TablaId = keyof DatosMeta;

export const TABLAS: Record<TablaId, { tabla: string; orden: string; descendente: boolean }> = {
  borradores: { tabla: "metageminis_borradores", orden: "creado_en", descendente: true },
  piezas: { tabla: "metageminis_piezas", orden: "creado_en", descendente: true },
  campanas: { tabla: "metageminis_campanas", orden: "creado_en", descendente: true },
  resultados: { tabla: "metageminis_resultados", orden: "creado_en", descendente: true },
  donaciones: { tabla: "metageminis_donaciones", orden: "confirmada_en", descendente: true },
  enlaces: { tabla: "metageminis_enlaces_pago", orden: "creado_en", descendente: true },
  agentes: { tabla: "metageminis_agentes", orden: "nombre", descendente: false },
  hallazgos: { tabla: "metageminis_hallazgos", orden: "creado_en", descendente: true },
};

export const LIMITE_FILAS = 300;

export interface ErrorBd {
  code?: string;
  message?: string;
}

interface RespuestaBd<T> {
  data: T | null;
  error: ErrorBd | null;
}

/** Lo mínimo del cliente de Supabase que usamos (así las pruebas inyectan uno falso). */
export interface ClienteMeta {
  from(tabla: string): {
    select(columnas: string): {
      order(columna: string, opciones: { ascending: boolean }): {
        limit(n: number): PromiseLike<RespuestaBd<unknown[]>>;
      };
    };
  };
  rpc(nombre: string, args?: Record<string, unknown>): PromiseLike<RespuestaBd<unknown>>;
  auth: { getSession(): PromiseLike<{ data: { session: unknown | null } }> };
}

export interface Carga {
  datos: DatosMeta;
  /** Tablas que no existen todavía (migración sin aplicar). */
  sinTabla: TablaId[];
  /** Tablas que existen pero no se pudieron leer, con el motivo en palabras. */
  errores: Partial<Record<TablaId, string>>;
  /** false = no hay sesión (las políticas no dejan leer nada sin ella). */
  sesion: boolean;
}

export function datosVacios(): DatosMeta {
  return { borradores: [], piezas: [], campanas: [], resultados: [], donaciones: [], enlaces: [], agentes: [], hallazgos: [] };
}

/** ¿El error significa «esta tabla no existe»? (PostgREST PGRST205, Postgres 42P01). */
export function tablaAusente(error: ErrorBd | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    msg.includes("does not exist") ||
    msg.includes("could not find the table") ||
    msg.includes("schema cache")
  );
}

export function sinPermiso(error: ErrorBd | null | undefined): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  return code === "42501" || code === "PGRST301" || code === "401" || (error.message ?? "").toLowerCase().includes("permission denied");
}

export function motivoError(error: ErrorBd | null | undefined): string {
  if (!error) return "";
  if (sinPermiso(error)) return "Solo para miembros de MetaGenesis con sesión iniciada.";
  return error.message || error.code || "No se pudo leer.";
}

function clienteReal(): ClienteMeta {
  return createClient() as unknown as ClienteMeta;
}

export async function cargarTodo(cliente?: ClienteMeta): Promise<Carga> {
  const datos = datosVacios();
  const sinTabla: TablaId[] = [];
  const errores: Partial<Record<TablaId, string>> = {};
  let sb: ClienteMeta;
  try {
    sb = cliente ?? clienteReal();
  } catch (e) {
    const motivo = e instanceof Error ? e.message : "sin conexión con la base de datos";
    for (const id of Object.keys(TABLAS) as TablaId[]) errores[id] = motivo;
    return { datos, sinTabla, errores, sesion: false };
  }
  let sesion = true;
  try {
    const { data } = await sb.auth.getSession();
    sesion = !!data?.session;
  } catch {
    sesion = false;
  }
  if (!sesion) return { datos, sinTabla, errores, sesion: false };

  await Promise.all(
    (Object.keys(TABLAS) as TablaId[]).map(async (id) => {
      const t = TABLAS[id];
      try {
        const { data, error } = await sb.from(t.tabla).select("*").order(t.orden, { ascending: !t.descendente }).limit(LIMITE_FILAS);
        if (error) {
          if (tablaAusente(error)) sinTabla.push(id);
          else errores[id] = motivoError(error);
          return;
        }
        (datos[id] as unknown[]) = Array.isArray(data) ? data : [];
      } catch (e) {
        errores[id] = e instanceof Error ? e.message : "sin red";
      }
    }),
  );
  return { datos, sinTabla: sinTabla.sort(), errores, sesion };
}

export interface RespuestaOp {
  ok: boolean;
  motivo?: string;
}

function motivoRpc(error: ErrorBd): string {
  const code = error.code ?? "";
  if (code === "42501") return "Solo un dueño de MetaGenesis puede aprobar o descartar.";
  if (code === "23514") return "Ese cambio de estado no es válido (¿ya está decidido?).";
  if (code === "P0002") return "No se encontró el elemento.";
  if (code === "PGRST202" || code === "42883") return "La base de datos aún no tiene las funciones de MetaGeminis (migración sin aplicar).";
  return error.message || "No se pudo completar.";
}

async function decidir(nombre: string, id: string, aprobar: boolean, motivo: string | undefined, cliente?: ClienteMeta): Promise<RespuestaOp> {
  if (!id) return { ok: false, motivo: "Falta el identificador." };
  try {
    const sb = cliente ?? clienteReal();
    const { error } = await sb.rpc(nombre, { _id: id, _aprobar: aprobar, _motivo: motivo?.trim() ? motivo.trim().slice(0, 300) : null });
    return error ? { ok: false, motivo: motivoRpc(error) } : { ok: true };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "sin red" };
  }
}

export function decidirBorrador(id: string, aprobar: boolean, motivo?: string, cliente?: ClienteMeta): Promise<RespuestaOp> {
  return decidir("metageminis_decidir_borrador", id, aprobar, motivo, cliente);
}

export function decidirPieza(id: string, aprobar: boolean, motivo?: string, cliente?: ClienteMeta): Promise<RespuestaOp> {
  return decidir("metageminis_decidir_pieza", id, aprobar, motivo, cliente);
}

/** Un dueño marca como hecho lo que envió o publicó él a mano (borrador manual aprobado → enviado; pieza aprobada → publicada). */
export async function marcarHecho(tabla: "borrador" | "pieza", id: string, cliente?: ClienteMeta): Promise<RespuestaOp> {
  if (!id) return { ok: false, motivo: "Falta el identificador." };
  try {
    const sb = cliente ?? clienteReal();
    const { error } = await sb.rpc("metageminis_marcar_hecho", { _tabla: tabla, _id: id });
    return error ? { ok: false, motivo: motivoRpc(error) } : { ok: true };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "sin red" };
  }
}

/** Un dueño confirma (o retira) un enlace de pago de Stripe: solo los confirmados se pueden compartir. */
export async function confirmarEnlace(id: string, activo: boolean, cliente?: ClienteMeta): Promise<RespuestaOp> {
  if (!id) return { ok: false, motivo: "Falta el identificador." };
  try {
    const sb = cliente ?? clienteReal();
    const { error } = await sb.rpc("metageminis_confirmar_enlace", { _id: id, _activo: activo });
    return error ? { ok: false, motivo: motivoRpc(error) } : { ok: true };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "sin red" };
  }
}
