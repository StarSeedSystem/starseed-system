/**
 * Descubrimiento progresivo de herramientas MCP (patrón Strata de Klavis).
 * Tres metaherramientas en vez de volcar todas las acciones al modelo; el resto
 * se descubre por palabras clave con un índice BM25 propio. Puro, sin `node:*`.
 * Contrato: architecture/repos-libreria-1025.md §3 (grupo agentes, Klavis).
 */
import type { HerramientaMcp } from "./protocolo";
import { crearIndiceBm25 } from "./indice-bm25";

export { tokenizar, crearIndiceBm25 } from "./indice-bm25";
export type { DocumentoBm25 } from "./indice-bm25";

export type MedioIa = "modelo-pequeno" | "modelo-mediano" | "modelo-grande";
export const PERFILES_MEDIO: Record<MedioIa, { maxResultados: number; maxDescripcion: number; conEsquema: boolean }> = {
  "modelo-pequeno": { maxResultados: 3, maxDescripcion: 80, conEsquema: false },
  "modelo-mediano": { maxResultados: 5, maxDescripcion: 160, conEsquema: false },
  "modelo-grande": { maxResultados: 8, maxDescripcion: 400, conEsquema: true },
};

export const UMBRAL_PROGRESIVO = 12;
export const METAHERRAMIENTAS = ["descubrir_herramientas", "detalle_herramienta", "ejecutar_herramienta"] as const;

export interface OpcionesProgresivo {
  medio?: MedioIa;
  umbral?: number;
  permitida?: (h: HerramientaMcp) => boolean;
}

function clavesDeEsquema(esquema: Record<string, unknown>): string[] {
  const propiedades = esquema.properties;
  return typeof propiedades === "object" && propiedades !== null ? Object.keys(propiedades as Record<string, unknown>) : [];
}
function recortar(texto: string, maximo: number): string {
  return texto.length <= maximo ? texto : `${texto.slice(0, Math.max(0, maximo - 1)).trimEnd()}…`;
}
function error(texto: string) {
  return { contenido: [{ tipo: "texto" as const, texto }], esError: true };
}
export function envolverProgresivo(herramientas: HerramientaMcp[], opciones: OpcionesProgresivo = {}): HerramientaMcp[] {
  const visible = herramientas.filter(opciones.permitida ?? (() => true));
  if (visible.length <= (opciones.umbral ?? UMBRAL_PROGRESIVO)) return visible;
  const perfil = PERFILES_MEDIO[opciones.medio ?? "modelo-mediano"];
  const indice = crearIndiceBm25(
    visible.map((h) => ({
      id: h.nombre,
      texto: [h.nombre, h.descripcion, ...clavesDeEsquema(h.esquema)].join(" "),
    })),
  );
  const porNombre = new Map(visible.map((h) => [h.nombre, h]));
  const buscarVisible = (nombre: unknown) =>
    typeof nombre === "string" ? porNombre.get(nombre) : undefined;
  const esMeta = (nombre: unknown): boolean =>
    typeof nombre === "string" && (METAHERRAMIENTAS as readonly string[]).includes(nombre);

  const descubrir: HerramientaMcp = {
    nombre: "descubrir_herramientas",
    descripcion: "Busca acciones disponibles por palabras clave.",
    esquema: { type: "object", properties: { consulta: { type: "string" }, limite: { type: "number" } }, required: ["consulta"] },
    ejecutar: async (args) => {
      const consulta = typeof args.consulta === "string" ? args.consulta : "";
      const pedido = typeof args.limite === "number" && Number.isFinite(args.limite)
        ? Math.floor(args.limite)
        : perfil.maxResultados;
      const limite = Math.max(1, Math.min(pedido, perfil.maxResultados));
      const resultados = indice.buscar(consulta, limite).map((hallazgo) => {
        const herramienta = porNombre.get(hallazgo.id);
        return {
          nombre: hallazgo.id,
          descripcion: herramienta
            ? recortar(herramienta.descripcion, perfil.maxDescripcion)
            : "",
          ...(perfil.conEsquema && herramienta ? { esquema: herramienta.esquema } : {}),
        };
      });
      const cuerpo = resultados.length
        ? { resultados, total: visible.length }
        : { resultados: [], total: visible.length, sugerencia: "prueba con otras palabras" };
      return { contenido: [{ tipo: "texto" as const, texto: JSON.stringify(cuerpo) }] };
    },
  };

  const detalle: HerramientaMcp = {
    nombre: "detalle_herramienta",
    descripcion: "Muestra la ficha completa de una acción visible.",
    esquema: { type: "object", properties: { nombre: { type: "string" } }, required: ["nombre"] },
    ejecutar: async (args) => {
      const herramienta = buscarVisible(args.nombre);
      if (!herramienta) {
        return error(`Herramienta desconocida o no permitida: ${String(args.nombre ?? "")}`);
      }
      return { contenido: [{ tipo: "texto" as const, texto: JSON.stringify({ nombre: herramienta.nombre, descripcion: herramienta.descripcion, esquema: herramienta.esquema }) }] };
    },
  };
  const ejecutar: HerramientaMcp = {
    nombre: "ejecutar_herramienta",
    descripcion: "Ejecuta una acción visible con sus argumentos.",
    esquema: { type: "object", properties: { nombre: { type: "string" }, argumentos: { type: "object" } }, required: ["nombre"] },
    ejecutar: async (args, ctx) => {
      const herramienta = buscarVisible(args.nombre);
      if (!herramienta || esMeta(args.nombre)) {
        return error(`Herramienta desconocida o no permitida: ${String(args.nombre ?? "")}`);
      }
      const argumentos = typeof args.argumentos === "object" && args.argumentos !== null
        ? (args.argumentos as Record<string, unknown>)
        : {};
      try {
        return await herramienta.ejecutar(argumentos, ctx);
      } catch {
        return error("La herramienta falló.");
      }
    },
  };

  return [descubrir, detalle, ejecutar];
}
