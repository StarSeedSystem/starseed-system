/**
 * GENESIS · HERRAMIENTA MCP «variaciones_buscar» (Ola 1019V, tarea Y) · 2026-10-29
 * ─────────────────────────────────────────────────────────────────────────────
 * Deja que Claude, otros servicios y los artefactos con la capacidad `mcp`
 * vean las variaciones públicas de un elemento (architecture/variaciones-publicas.md
 * §6 y §7, bloque Abierto). Solo lee lo publicado (RLS por `publicado_en`) y
 * nunca imprime el `payload`: lo privado no cruza la herramienta.
 *
 * Módulo PURO: sin React, sin red, sin `node:*`. La capa de datos llega
 * inyectada por contexto (`crearDatosVariaciones` de src/lib/variaciones/datos.ts).
 * Contrato: architecture/genesis-conectores-abiertos.md §7.
 */
import type { HerramientaMcp } from "./protocolo";
import type { Listado, OpcionesListar, OrdenVariaciones } from "../../variaciones/datos";
import { leerClave } from "../../variaciones/clave-elemento";

/** Órdenes admitidos, en sync con `OrdenVariaciones` de la capa de datos. */
export const ORDENES_VARIACIONES = ["aurora", "novedades", "populares", "usadas", "valoradas", "alfabetico"] as const;

/** La función de listar que se inyecta (la de `crearDatosVariaciones` cumple sola). */
export type ListarVariaciones = (clave: string, opciones?: OpcionesListar) => Promise<Listado>;

/** Convierte un Listado en líneas de texto para la respuesta MCP (sin payload). */
export function lineasDeListado(clave: string, listado: Listado): string[] {
  const lineas: string[] = [`Variaciones públicas de «${clave}» · ${listado.total} en total`];
  if (!listado.disponible) {
    lineas.push("Las variaciones públicas no están disponibles ahora mismo en este proyecto.");
    return lineas;
  }
  if (listado.error) lineas.push(`Aviso: ${listado.error}`);
  if (listado.variaciones.length === 0 && !listado.error) {
    lineas.push("Sin variaciones publicadas todavía para esta clave.");
    return lineas;
  }
  for (const v of listado.variaciones) {
    const valoracion = v.valoraciones > 0 ? ` · valoración ${v.valoracion_media.toFixed(1)} (${v.valoraciones})` : "";
    const etiquetas = v.etiquetas.length > 0 ? ` · ${v.etiquetas.join(", ")}` : "";
    lineas.push(`- ${v.titulo} — ${v.tipo} · ${v.licencia}${valoracion}${etiquetas}`);
  }
  return lineas;
}

/** Ficha MCP que busca variaciones públicas de una clave `<familia>:<id>[#<parte>]`. */
export function crearHerramientaVariaciones(listar: ListarVariaciones): HerramientaMcp {
  return {
    nombre: "variaciones_buscar",
    descripcion: "Busca variaciones públicas de un elemento (clave familia:id) con búsqueda de texto y orden",
    esquema: {
      type: "object",
      required: ["clave"],
      properties: {
        clave: { type: "string", description: "Clave canónica, p. ej. «widget:clima» o «tema:synthwave-horizon»" },
        buscar: { type: "string", description: "Texto a buscar en título y descripción" },
        orden: { type: "string", enum: [...ORDENES_VARIACIONES], default: "novedades" },
      },
    },
    ejecutar: async (args) => {
      const clave = typeof args.clave === "string" ? args.clave.trim() : "";
      const rechazar = (texto: string) => ({
        contenido: [{ tipo: "texto" as const, texto }],
        esError: true,
      });
      if (!leerClave(clave)) {
        return rechazar(`Clave de elemento no válida: «${clave || String(args.clave ?? "")}». Formato: familia:id[#parte], p. ej. «widget:clima»`);
      }
      const orden = typeof args.orden === "string" ? args.orden : "novedades";
      if (!(ORDENES_VARIACIONES as readonly string[]).includes(orden)) {
        return rechazar(`Orden no admitido: «${orden}». Usa uno de: ${ORDENES_VARIACIONES.join(", ")}`);
      }
      const opciones: OpcionesListar = { orden: orden as OrdenVariaciones };
      const buscar = typeof args.buscar === "string" ? args.buscar.trim().slice(0, 80) : "";
      if (buscar) opciones.buscar = buscar;
      let listado: Listado;
      try {
        listado = await listar(clave, opciones);
      } catch (e) {
        return rechazar(`Error al listar variaciones: ${e instanceof Error ? e.message : "sin conexión"}`);
      }
      const contenido = lineasDeListado(clave, listado).map((texto) => ({ tipo: "texto" as const, texto }));
      return { contenido, esError: listado.disponible ? undefined : true };
    },
  };
}
