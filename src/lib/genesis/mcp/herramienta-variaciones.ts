/**
 * GENESIS · HERRAMIENTA MCP `variaciones_buscar` (2026-10-29)
 * ─────────────────────────────────────────────────────────────────────────────
 * La ventana «Variaciones públicas» (architecture/variaciones-publicas.md §4, tarea Y
 * de §7) en manos de Claude y de cualquier servicio o artefacto con la capacidad `mcp`:
 * lista lo publicado de una clave de elemento (`<familia>:<id>[#<parte>]`, §2) con
 * buscador y orden, antes de probar, aplicar o publicar una variación propia.
 *
 * Módulo PURO: la capa de datos llega inyectada (`listarVariaciones`, la de
 * `crearDatosVariaciones(...)`), sin red, sin disco y sin reloj. No lanzan procesos.
 * El cableado en `HERRAMIENTAS_MCP` va en su propia tarea.
 */
import { leerClave } from "@/lib/variaciones/clave-elemento";
import type { FilaVariacion, Listado, OrdenVariaciones } from "@/lib/variaciones/datos";

/* ── Tipos ─────────────────────────────────────────────────────────────────── */

export interface BloqueTexto {
  tipo: "texto";
  texto: string;
}

export interface ResultadoMcp {
  contenido: BloqueTexto[];
  esError?: boolean;
}

/** La capa de datos ya lista, inyectada para que aquí no haya cliente ni red. */
export type ListarVariaciones = (
  clave: string,
  opciones?: { buscar?: string; orden?: OrdenVariaciones },
) => Promise<Listado>;

/**
 * Ficha compatible con `HerramientaMcp`. `permiso` queda como texto porque
 * `PermisoMcp` aún no contempla «variaciones:leer» y ampliarlo toca otro archivo.
 */
export interface FichaHerramientaVariaciones {
  nombre: string;
  descripcion: string;
  permiso: string;
  esquema: Record<string, unknown>;
  ejecutar: (args: Record<string, unknown>) => Promise<ResultadoMcp>;
}

/* ── Órdenes admitidos (los del §4 de la lámina) ───────────────────────────── */

export const ORDENES_VARIACIONES: readonly OrdenVariaciones[] = [
  "aurora",
  "novedades",
  "populares",
  "usadas",
  "valoradas",
  "alfabetico",
];

/* ── Herramienta ───────────────────────────────────────────────────────────── */

export function crearVariacionesBuscar(listar: ListarVariaciones): FichaHerramientaVariaciones {
  return {
    nombre: "variaciones_buscar",
    descripcion:
      "Lista las variaciones públicas publicadas para una clave de elemento "
      + "(<familia>:<id>[#<parte>], p. ej. widget:clima), con buscador y orden.",
    permiso: "variaciones:leer",
    esquema: {
      type: "object",
      required: ["clave"],
      properties: {
        clave: {
          type: "string",
          description: "Clave canónica del elemento: <familia>:<id>[#<parte>], p. ej. widget:clima",
        },
        buscar: { type: "string", description: "Texto a buscar en el título o la descripción" },
        orden: {
          type: "string",
          enum: [...ORDENES_VARIACIONES],
          default: "novedades",
          description: "Cómo ordenar el listado",
        },
      },
    },
    ejecutar: async (args) => ejecutarBusqueda(args, listar),
  };
}

async function ejecutarBusqueda(
  args: Record<string, unknown>,
  listar: ListarVariaciones,
): Promise<ResultadoMcp> {
  const clave = typeof args.clave === "string" ? args.clave.trim() : "";
  if (!leerClave(clave)) {
    return {
      esError: true,
      contenido: [bloqueError("Clave de elemento no válida: «" + mostrar(args.clave)
        + "». Formato esperado: <familia>:<id>[#<parte>], por ejemplo widget:clima.")],
    };
  }
  const buscar = typeof args.buscar === "string" ? args.buscar.trim() : undefined;
  const orden = typeof args.orden === "string" ? args.orden : undefined;
  if (orden && !(ORDENES_VARIACIONES as readonly string[]).includes(orden)) {
    return {
      esError: true,
      contenido: [bloqueError(`Orden no válido: «${orden}». Valores admitidos: ${ORDENES_VARIACIONES.join(", ")}.`)],
    };
  }
  const opciones: { buscar?: string; orden?: OrdenVariaciones } = {};
  if (buscar) opciones.buscar = buscar;
  if (orden) opciones.orden = orden as OrdenVariaciones;
  return presentar(await listar(clave, opciones), clave, buscar);
}

/** Convierte el listado de la capa de datos en bloques de texto para el MCP. */
function presentar(
  listado: Listado,
  clave: string,
  buscar?: string,
): ResultadoMcp {
  if (!listado.disponible) {
    const motivo = listado.error ? ` (${listado.error})` : "";
    return { esError: true, contenido: [bloqueError(`Las variaciones públicas aún no están disponibles en este proyecto${motivo}.`)] };
  }
  if (listado.error) {
    return { esError: true, contenido: [bloqueError(listado.error)] };
  }
  const paginas = Math.max(Math.ceil(listado.total / listado.porPagina), 1);
  const partes = [`Variaciones públicas de ${clave}: ${listado.total} publicadas`, `página ${listado.pagina} de ${paginas}`];
  if (buscar) partes.push(`búsqueda: «${buscar}»`);
  const cabecera: BloqueTexto = { tipo: "texto", texto: partes.join(" · ") };
  if (listado.total === 0) {
    return { contenido: [cabecera, { tipo: "texto", texto: `Nadie ha publicado variaciones todavía para ${clave}.` }] };
  }
  return { contenido: [cabecera, ...listado.variaciones.map(lineaVariacion)] };
}

/** Cada variación da una línea: título, tipo, versión, licencia, valoración y usos. Sin payload. */
function lineaVariacion(v: FilaVariacion): BloqueTexto {
  const partes = [`· ${v.titulo}`, v.tipo === "variacion" ? "variación" : v.tipo];
  if (v.version) partes.push(`v${v.version}`);
  if (v.tema) partes.push(`tema: ${v.tema}`);
  partes.push(`licencia: ${v.licencia}`, `valoración: ${v.valoracion_media.toFixed(1)} (${v.valoraciones})`, `usos: ${v.usos}`);
  if (v.etiquetas.length) partes.push(`etiquetas: ${v.etiquetas.join(", ")}`);
  return { tipo: "texto", texto: partes.join(" · ") };
}

function bloqueError(texto: string): BloqueTexto {
  return { tipo: "texto", texto };
}

function mostrar(valor: unknown): string {
  return typeof valor === "string" && valor.trim() ? valor.trim() : "(ausente)";
}
