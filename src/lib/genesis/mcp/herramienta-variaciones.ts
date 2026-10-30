/**
 * GENESIS · HERRAMIENTA MCP `variaciones_buscar` (Ola 1019V)
 * Ve variaciones públicas de una clave de elemento (architecture/variaciones-publicas.md §7).
 * Módulo PURO: la capa de datos se INYECTA; sin red, sin `node:*`, sin disco. Solo salen
 * metadatos públicos: nunca el payload ni secretos.
 */

import { leerClave } from "../../variaciones/clave-elemento";
import type { FilaVariacion, Listado, OpcionesListar, OrdenVariaciones } from "../../variaciones/datos";

export const NOMBRE_HERRAMIENTA_VARIACIONES = "variaciones_buscar", PERMISO_VARIACIONES_BUSCAR = "variaciones:buscar";
export const ORDENES_VARIACIONES: readonly OrdenVariaciones[] = ["aurora", "novedades", "populares", "usadas", "valoradas", "alfabetico"];

/** Firma de la capa de datos, inyectada para no tocar Supabase desde aquí. */
export type ListarVariaciones = (clave: string, opciones?: OpcionesListar) => Promise<Listado>;
export interface ContextoVariaciones { listarVariaciones?: ListarVariaciones }
export interface BloqueContenido { tipo: "texto"; texto: string }
export interface ResultadoVariaciones { contenido: BloqueContenido[]; esError?: boolean }

/** `inputSchema` es el nombre del estándar MCP; `esquema`, el que usa el protocolo de Genesis. */
export const ESQUEMA_VARIACIONES_BUSCAR = {
  type: "object", additionalProperties: false, required: ["clave"],
  properties: {
    clave: { type: "string", description: "Clave canónica del elemento: familia:id[#parte]" },
    buscar: { type: "string", maxLength: 80, description: "Texto para filtrar por título o descripción" },
    orden: { type: "string", enum: [...ORDENES_VARIACIONES], description: "aurora, novedades, populares, usadas, valoradas o alfabético" },
  },
} as const;

export interface FichaVariaciones {
  nombre: string; descripcion: string; permiso: string;
  esquema: typeof ESQUEMA_VARIACIONES_BUSCAR; inputSchema: typeof ESQUEMA_VARIACIONES_BUSCAR;
  ejecutar: (args: Record<string, unknown>, ctx?: unknown) => Promise<ResultadoVariaciones>;
}
export interface OpcionesBusqueda { clave: string; buscar?: string; orden?: OrdenVariaciones }
export type LecturaArgumentos = { ok: true; opciones: OpcionesBusqueda } | { ok: false; motivo: string };

function esOrden(valor: string): valor is OrdenVariaciones {
  return (ORDENES_VARIACIONES as readonly string[]).includes(valor);
}

/** Valida lo que llega del exterior antes de llamar a la base. */
export function leerArgumentosVariaciones(args: Record<string, unknown>): LecturaArgumentos {
  const clave = typeof args.clave === "string" ? args.clave.trim() : "";
  if (!clave) return { ok: false, motivo: "Clave: hace falta la clave del elemento (familia:id)" };
  if (!leerClave(clave)) return { ok: false, motivo: `Clave: «${clave}» no es una clave de elemento válida` };
  const buscar = typeof args.buscar === "string" ? args.buscar.trim().slice(0, 80) : "";
  const orden = typeof args.orden === "string" ? args.orden.trim() : "";
  if (orden && !esOrden(orden)) return { ok: false, motivo: `Orden: «${orden}» no es un orden (${ORDENES_VARIACIONES.join(", ")})` };
  return { ok: true, opciones: { clave, ...(buscar ? { buscar } : {}), ...(orden ? { orden: orden as OrdenVariaciones } : {}) } };
}

const LIMITE_TEXTO = 160;
const plano = (valor: unknown) => String(valor ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
const recortar = (texto: string, limite = LIMITE_TEXTO) => (texto.length > limite ? `${texto.slice(0, limite - 1)}…` : texto);
const media = (valor: number) => (Number.isFinite(valor) ? valor : 0).toFixed(1).replace(".", ",");

/** Una línea por variación, solo con lo público (el payload jamás se imprime). */
export function resumenVariacion(v: FilaVariacion): string {
  const partes = [
    `«${recortar(plano(v.titulo))}»`, plano(v.tipo), v.version ? `v${plano(v.version)}` : "", plano(v.licencia),
    `★ ${media(v.valoracion_media)} (${Number(v.valoraciones) || 0})`, `${Number(v.usos) || 0} usos`,
    `de ${recortar(plano(v.autor), 60)}`,
  ];
  return partes.filter(Boolean).join(" · ");
}

/** Cabecera, filtros, variaciones y total; también dice cuándo no hay nada o falta la tabla. */
export function formatearListado(clave: string, opciones: OpcionesBusqueda, listado: Listado): string[] {
  const lineas = [`Variaciones públicas de «${clave}»`];
  const filtros = [opciones.buscar ? `búsqueda: «${opciones.buscar}»` : "", opciones.orden ? `orden: ${opciones.orden}` : ""].filter(Boolean);
  if (filtros.length) lineas.push(`Filtros · ${filtros.join(" · ")}`);
  if (!listado.disponible) {
    lineas.push(listado.error ? `Las variaciones públicas no están disponibles: ${plano(listado.error)}` : "Las variaciones públicas todavía no están disponibles en este proyecto.");
    return lineas;
  }
  if (listado.variaciones.length === 0) lineas.push("Sin variaciones públicas todavía.");
  else listado.variaciones.forEach((v, i) => lineas.push(`${i + 1}. ${resumenVariacion(v)}`));
  lineas.push(`Total: ${listado.total} · página ${listado.pagina} · ${listado.porPagina} por página`);
  return lineas;
}

export async function ejecutarVariacionesBuscar(listarVariaciones: ListarVariaciones, args: Record<string, unknown>): Promise<ResultadoVariaciones> {
  const leido = leerArgumentosVariaciones(args ?? {});
  if (!leido.ok) return { contenido: [{ tipo: "texto", texto: `Error: ${leido.motivo}` }], esError: true };
  const { clave, buscar, orden } = leido.opciones;
  try {
    const listado = await listarVariaciones(clave, { buscar, orden });
    return {
      contenido: formatearListado(clave, leido.opciones, listado).map((texto) => ({ tipo: "texto", texto })),
      ...(listado.disponible ? {} : { esError: true }),
    };
  } catch (e) {
    return { contenido: [{ tipo: "texto", texto: `Error: Variaciones: ${e instanceof Error ? e.message : "sin conexión"}` }], esError: true };
  }
}

/** Ficha lista para registrar; el contexto MCP trae la capa de datos inyectada. */
export const variaciones_buscar: FichaVariaciones = {
  nombre: NOMBRE_HERRAMIENTA_VARIACIONES,
  descripcion: "Lista las variaciones públicas de un elemento del OS, con búsqueda y orden",
  permiso: PERMISO_VARIACIONES_BUSCAR,
  esquema: ESQUEMA_VARIACIONES_BUSCAR,
  inputSchema: ESQUEMA_VARIACIONES_BUSCAR,
  ejecutar: (args, ctx) => {
    const listar = (ctx as ContextoVariaciones | undefined)?.listarVariaciones;
    if (typeof listar !== "function") {
      return Promise.resolve({ contenido: [{ tipo: "texto", texto: "Error: Variaciones: falta la capa de datos inyectada" }], esError: true });
    }
    return ejecutarVariacionesBuscar(listar, args);
  },
};

/** Atajo para quien prefiera inyectar la capa de datos al construir la herramienta. */
export function crearHerramientaVariaciones(listarVariaciones: ListarVariaciones): FichaVariaciones {
  return { ...variaciones_buscar, ejecutar: (args) => ejecutarVariacionesBuscar(listarVariaciones, args) };
}
