import { BloqueUi, UiSpec, pareceCodigo, MAXIMO_BLOQUES, PROFUNDIDAD_MAXIMA } from "../../../lib/nucleo/ui-spec";

export type TipoNodo3D =
  | "columna"
  | "fila"
  | "texto"
  | "boton"
  | "imagen"
  | "lista"
  | "tarjeta"
  | "separador"
  | "nopintable";

export interface Nodo3D {
  tipo: TipoNodo3D;
  props: Record<string, unknown>;
  hijos: Nodo3D[];
  motivo?: string;
  bloqueId?: string;
}

/**
 * Mapea una especificación de UI a un árbol neutro para renderizado 3D.
 */
export function aEscena3D(spec: UiSpec): Nodo3D[] {
  const ctx = { bloques: 0 };
  return spec.bloques.map(b => mapearBloque(b, 1, ctx));
}

function mapearBloque(bloque: BloqueUi, profundidad: number, ctx: { bloques: number }): Nodo3D {
  ctx.bloques++;
  if (profundidad > PROFUNDIDAD_MAXIMA || ctx.bloques > MAXIMO_BLOQUES) {
    return {
      tipo: "nopintable",
      props: {},
      hijos: [],
      motivo: "Límite de profundidad o bloques excedido",
      bloqueId: bloque.id
    };
  }
  const hijos = (bloque.hijos || []).map(h => mapearBloque(h, profundidad + 1, ctx));

  switch (bloque.tipo) {
    case "panel":
      return { tipo: "tarjeta", props: { ...bloque.props }, hijos, bloqueId: bloque.id };
    case "rejilla":
      const alineacion = bloque.props.alineacion === "fila" ? "fila" : "columna";
      return { tipo: alineacion, props: { ...bloque.props }, hijos, bloqueId: bloque.id };
    case "texto":
      return { tipo: "texto", props: { ...bloque.props }, hijos, bloqueId: bloque.id };
    case "lista":
      return { tipo: "lista", props: { ...bloque.props }, hijos, bloqueId: bloque.id };
    case "acciones":
      const acciones = Array.isArray(bloque.props.acciones) 
        ? bloque.props.acciones.map((a): Nodo3D => ({ tipo: "boton", props: { id: a }, hijos: [], bloqueId: a as string }))
        : [];
      return { tipo: "fila", props: { ...bloque.props }, hijos: [...hijos, ...acciones], bloqueId: bloque.id };
    case "widget":
    case "embebido":
      return { 
        tipo: "nopintable", 
        props: {}, 
        hijos: [], 
        motivo: `Este bloque ${bloque.tipo} aún no tiene vista 3D`,
        bloqueId: bloque.id 
      };
    default:
      return {
        tipo: "nopintable",
        props: {},
        hijos: [],
        motivo: "Tipo de bloque desconocido",
        bloqueId: bloque.id
      };
  }
}
