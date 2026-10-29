/**
 * StarSeed XR · UISPEC → ESCENA 3D (XR1010AN · contrato `architecture/starseed-xr.md` §3 b, escalón 2).
 * Traduce un `UiSpec` a un árbol NEUTRO que uikit sabe pintar. Módulo PURO: sin red, sin disco,
 * sin WebGL, nunca lanza. Honestidad: el texto se limpia, las URLs de imagen sólo si son https,
 * y los bloques sin equivalente 3D salen como «nopintable» con su motivo.
 */
import { MAXIMO_BLOQUES, PROFUNDIDAD_MAXIMA, pareceCodigo, validarUiSpec, type BloqueUi, type UiSpec } from "../../../lib/nucleo/ui-spec";

/** Tipos de nodo neutros que el renderizador de uikit entiende. */
export type TipoNodo = "columna" | "fila" | "texto" | "boton" | "imagen" | "lista" | "tarjeta" | "separador" | "nopintable";

export interface NodoEscena3D { tipo: TipoNodo; props: Record<string, unknown>; hijos: NodoEscena3D[] }
export interface ResultadoMapa { raiz: NodoEscena3D; avisos: string[] }
/** Lo que pinta `UiSpec3D`: un árbol o nada (con los problemas del spec inválido). */
export interface Vista3D { raiz: NodoEscena3D | null; problemas: string[]; avisos: string[] }

export const MOTIVO_NO_VISTA = "Este bloque aún no tiene vista 3D";
const OMITIDO = "[texto omitido]";
const AVISO_CORTE = `Demasiados bloques: se pintan los primeros ${MAXIMO_BLOQUES}.`;
const AVISO_PROFUNDIDAD = `Profundidad excesiva: el máximo son ${PROFUNDIDAD_MAXIMA} niveles.`;
const IMAGEN_OK = /^https:\/\/\S+\.\S+/i;
const ES_URL = /^https?:\/\//i;
interface Contexto { bloques: number; avisos: string[] }

const limpio = (tipo: TipoNodo, props: Record<string, unknown> = {}): NodoEscena3D => ({ tipo, props, hijos: [] });

/** Limpia un texto visible: sin etiquetas HTML y con lo que huela a código sustituido. */
function sanearTexto(valor: unknown): string | undefined {
  if (typeof valor !== "string") return undefined;
  const sinEtiquetas = valor.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return sinEtiquetas.length === 0 || pareceCodigo(sinEtiquetas) ? OMITIDO : sinEtiquetas;
}

const cadena = (props: Record<string, unknown>, clave: string): string | undefined => sanearTexto(props[clave]);
const numero = (props: Record<string, unknown>, clave: string): number | undefined => {
  const v = props[clave];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
};
/** Quita de props lo que no llegó: nada de entradas vacías en el árbol. */
const limpiar = (r: Record<string, unknown | undefined>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined));

/** Prop `icono` que trae una imagen: sólo https pasa; un nombre de icono aún no se pinta. */
function imagenDeIcono(valor: unknown): NodoEscena3D | null {
  if (typeof valor !== "string" || !ES_URL.test(valor)) return null;
  return IMAGEN_OK.test(valor) ? limpio("imagen", { src: valor }) : null;
}

const rama = (bloques: BloqueUi[] | undefined, profundidad: number, ctx: Contexto): NodoEscena3D[] =>
  (bloques ?? []).map((hijo) => mapaDeBloque(hijo, profundidad, ctx));

function mapaDeBloque(bloque: BloqueUi, profundidad: number, ctx: Contexto): NodoEscena3D {
  if (profundidad > PROFUNDIDAD_MAXIMA) return limpio("nopintable", { motivo: avisar(AVISO_PROFUNDIDAD, ctx) });
  ctx.bloques += 1;
  if (ctx.bloques > MAXIMO_BLOQUES) return limpio("nopintable", { motivo: avisar(AVISO_CORTE, ctx) });
  const props = bloque.props;
  switch (bloque.tipo) {
    case "panel": {
      const imagen = imagenDeIcono(props.icono);
      return {
        tipo: "tarjeta",
        props: limpiar({ titulo: cadena(props, "titulo"), subtitulo: cadena(props, "subtitulo") }),
        hijos: [...(imagen ? [imagen] : []), ...rama(bloque.hijos, profundidad + 1, ctx)],
      };
    }
    case "rejilla":
      return { tipo: "columna", props: limpiar({ columnas: numero(props, "columnas") }), hijos: rama(bloque.hijos, profundidad + 1, ctx) };
    case "lista":
      return {
        tipo: "lista",
        props: limpiar({
          titulo: cadena(props, "titulo"),
          vacio: cadena(props, "vacio"),
          elementos: Array.isArray(props.elementos) ? props.elementos.map(sanearTexto).filter((v): v is string => v !== undefined) : undefined,
        }),
        hijos: rama(bloque.hijos, profundidad + 1, ctx),
      };
    case "texto":
      return limpio("texto", limpiar({
        contenido: cadena(props, "contenido"),
        nivel: numero(props, "nivel"),
        tono: cadena(props, "tono"),
        enfasis: cadena(props, "enfasis"),
        alineacion: cadena(props, "alineacion"),
      }));
    case "acciones": {
      const ids = Array.isArray(props.acciones) ? props.acciones.filter((a): a is string => typeof a === "string") : [];
      return { tipo: "fila", props: {}, hijos: [...ids.map((a) => limpio("boton", { accion: a, etiqueta: a })), ...rama(bloque.hijos, profundidad + 1, ctx)] };
    }
    default: // widget y embebido aún no tienen vista 3D; un tipo desconocido sale igual.
      return limpio("nopintable", { motivo: MOTIVO_NO_VISTA });
  }
}

/** Aviso único: todo mensaje une avisos y motivo, no un método que silencia ni lanza. */
function avisar(mensaje: string, ctx: Contexto): string {
  if (!ctx.avisos.includes(mensaje)) ctx.avisos.push(mensaje);
  return mensaje;
}

/** Convierte un `UiSpec` ya validado en el árbol neutro que pinta `UiSpec3D` en el visor. */
export function aEscena3D(espec: UiSpec): ResultadoMapa {
  const ctx: Contexto = { bloques: 0, avisos: [] };
  const raiz: NodoEscena3D = { tipo: "tarjeta", props: { titulo: sanearTexto(espec.titulo) ?? "Página" }, hijos: rama(espec.bloques, 1, ctx) };
  return { raiz, avisos: ctx.avisos };
}

/** Valida y mapea el spec crudo que llegue (de un modelo, de la malla): sin sorpresas. */
export function prepararVista(bruto: unknown): Vista3D {
  const { spec, problemas } = validarUiSpec(bruto);
  if (!spec) return { raiz: null, problemas, avisos: [] };
  const { raiz, avisos } = aEscena3D(spec);
  return { raiz, problemas, avisos };
}
