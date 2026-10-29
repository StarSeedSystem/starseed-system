/**
 * GENESIS · HERRAMIENTA MCP «variaciones_buscar» (2026-10-29). Deja ver las
 * VARIACIONES PÚBLICAS de un elemento del OS (variaciones, notas, repos,
 * fuentes y adaptaciones) para una clave «familia:id[#parte]» a Claude y a
 * los servicios con capacidad `mcp`. Módulo PURO: sin red, sin disco y sin
 * `node:*`; el listado (`listarVariaciones`) se inyecta al crearla, así las
 * pruebas corren sin red y Genesis lo conecta a su capa de datos.
 * Contrato: architecture/variaciones-publicas.md §4, §6 y §7 (tarea Y).
 */

export type OrdenVariaciones = "aurora" | "novedades" | "populares" | "usadas" | "valoradas" | "alfabetico";

export const ORDENES_VARIACIONES: readonly OrdenVariaciones[] = ["aurora", "novedades", "populares", "usadas", "valoradas", "alfabetico"];

export interface VariacionPublica {
  id: string; clave: string;
  tipo: "variacion" | "nota" | "repo" | "fuente" | "adaptacion";
  titulo: string;
  descripcion?: string;
  licencia?: string;
  etiquetas?: readonly string[];
  valoracionMedia?: number; usos?: number;
}

export type ListadorVariaciones = (p: { clave: string; buscar?: string; orden?: OrdenVariaciones }) => Promise<readonly VariacionPublica[]>;

export interface ArgumentosBusquedaVariaciones {
  clave: string;
  buscar?: string;
  orden?: OrdenVariaciones;
}

export type ValidacionArgumentosVariaciones =
  | { argumentos: ArgumentosBusquedaVariaciones; error?: undefined }
  | { argumentos?: undefined; error: string };

export interface ResultadoMcp {
  contenido: Array<{ tipo: "texto"; texto: string }>; esError?: boolean;
}

export interface FichaVariacionesBuscar {
  nombre: string; descripcion: string; permiso: "variaciones:buscar";
  esquema: Record<string, unknown>;
  ejecutar: (args: Record<string, unknown>) => Promise<ResultadoMcp>;
}

/** Valida y normaliza los argumentos: `clave` obligatoria, `buscar` y `orden` opcionales. */
export function validarArgumentosVariaciones(
  args: Record<string, unknown>,
): ValidacionArgumentosVariaciones {
  const crudo = args.clave;
  if (typeof crudo !== "string" || crudo.trim() === "") {
    return { error: "Error: hace falta la clave del elemento (p. ej. widget:clima)" };
  }
  const clave = crudo.trim().slice(0, 200);
  let buscar: string | undefined;
  if (args.buscar !== undefined && args.buscar !== null) {
    if (typeof args.buscar !== "string") return { error: "Error: buscar debe ser un texto" };
    buscar = args.buscar.trim().slice(0, 240);
  }
  let orden: OrdenVariaciones | undefined;
  if (args.orden !== undefined && args.orden !== null) {
    if (!ORDENES_VARIACIONES.includes(args.orden as OrdenVariaciones)) {
      return { error: `Error: orden inválido; usa uno de ${ORDENES_VARIACIONES.join(", ")}` };
    }
    orden = args.orden as OrdenVariaciones;
  }
  return { argumentos: { clave, ...(buscar ? { buscar } : {}), ...(orden ? { orden } : {}) } };
}

/** Pinta las variaciones como líneas de texto legibles por un modelo. */
export function formatearVariaciones(
  argumentos: ArgumentosBusquedaVariaciones,
  variaciones: readonly VariacionPublica[],
): string[] {
  const lineas: string[] = [
    `Variaciones públicas de «${argumentos.clave}» · orden: ${argumentos.orden ?? "aurora"} · ${variaciones.length} resultado(s)`,
  ];
  for (const v of variaciones) {
    const partes = [`[${v.tipo}] ${v.titulo}`];
    if (v.licencia) partes.push(`licencia ${v.licencia}`);
    if (v.usos !== undefined) partes.push(`${v.usos} usos`);
    const etiquetas = v.etiquetas?.length ? ` · ${v.etiquetas.join(", ")}` : "";
    lineas.push(`  · ${partes.join(" · ")}${etiquetas}`);
    if (v.descripcion) lineas.push(`    ${v.descripcion}`);
  }
  return lineas;
}

/** Crea la herramienta `variaciones_buscar` con el listador inyectado. */
export function crearHerramientaVariaciones(listar: ListadorVariaciones): FichaVariacionesBuscar {
  return {
    nombre: "variaciones_buscar",
    descripcion: "Busca las variaciones públicas de un elemento del OS por su clave",
    permiso: "variaciones:buscar",
    esquema: {
      type: "object", required: ["clave"],
      properties: {
        clave: { type: "string", description: "Clave del elemento: «familia:id» o «familia:id#parte»" },
        buscar: { type: "string", description: "Texto a buscar (opcional)" },
        orden: { type: "string", enum: [...ORDENES_VARIACIONES], description: "Orden (opcional; por defecto «aurora»)" },
      },
    },
    ejecutar: async (args: Record<string, unknown>): Promise<ResultadoMcp> => {
      const validacion = validarArgumentosVariaciones(args);
      if (validacion.error !== undefined) {
        return { contenido: [{ tipo: "texto", texto: validacion.error }], esError: true };
      }
      try {
        const variaciones = await listar(validacion.argumentos);
        return {
          contenido: formatearVariaciones(validacion.argumentos, variaciones).map((t) => ({ tipo: "texto" as const, texto: t })),
        };
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : "Error desconocido";
        return { contenido: [{ tipo: "texto", texto: `Error: ${mensaje}` }], esError: true };
      }
    },
  };
}
