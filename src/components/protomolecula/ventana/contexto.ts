/**
 * Ventana de la Protomolécula · contexto (puro). Qué tengo delante, validado: cualquier pantalla del OS puede
 * anunciar su contexto con `EVENTO_CONTEXTO_PROTO`, así que lo que llega se comprueba campo a campo, con
 * longitudes acotadas y vocabulario cerrado, antes de pintarlo o de meterlo en una petición.
 */
import { AMBITOS, type Ambito } from "@/lib/protomolecula/tipos";
import type {
  ActorProto,
  ContextoProto,
  EntidadProto,
  TipoEntidadProto,
} from "@/lib/protomolecula/peticion/contrato";
import type { OrigenPlan } from "./tipos";

type TipoSeleccion = NonNullable<ContextoProto["seleccion"]>["tipo"];

/** Si el contrato añade un tipo de entidad, TypeScript obliga a decidir su etiqueta aquí. */
export const ETIQUETA_ENTIDAD: Record<TipoEntidadProto, string> = {
  perfil: "Perfil",
  grupo: "Grupo",
  comunidad: "Comunidad",
  pagina: "Página",
  publicacion: "Publicación",
  mensaje: "Mensaje",
  archivo: "Archivo",
  pizarra: "Pizarra",
  escritorio: "Escritorio",
  widget: "Widget",
  molecula: "Molécula",
};

const ETIQUETA_SELECCION: Record<Exclude<TipoSeleccion, TipoEntidadProto>, string> = {
  bloque: "Bloque",
  texto: "Texto",
  imagen: "Imagen",
  objeto3d: "Objeto 3D",
};

export const ETIQUETA_AMBITO: Record<Ambito, string> = { personal: "Personal", perfil: "Perfil", grupo: "Grupo", publica: "Pública" };

/** Entidades que tienen gobierno propio (reglas de su Protomolécula). */
const GOBERNANTES: readonly TipoEntidadProto[] = ["grupo", "comunidad", "pagina"];

export const esTipoEntidad = (x: unknown): x is TipoEntidadProto => typeof x === "string" && Object.prototype.hasOwnProperty.call(ETIQUETA_ENTIDAD, x);
const esTipoSeleccion = (x: unknown): x is TipoSeleccion => esTipoEntidad(x) || (typeof x === "string" && Object.prototype.hasOwnProperty.call(ETIQUETA_SELECCION, x));
const esAmbito = (x: unknown): x is Ambito => typeof x === "string" && (AMBITOS as readonly string[]).includes(x);

/** Lo que una pantalla anuncia: parcial, y `null` quiere decir «ya no hay». */
export interface AnuncioContexto {
  ruta?: string;
  entidad?: EntidadProto | null;
  seleccion?: ContextoProto["seleccion"] | null;
  ambito?: Ambito;
  gobernadaPor?: EntidadProto | null;
}

const MAX_RUTA = 300, MAX_ID = 200, MAX_NOMBRE = 120, MAX_RESUMEN = 160;
const obj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const limpio = (x: unknown, max: number): string | undefined => {
  if (typeof x !== "string") return undefined;
  // Sin saltos ni caracteres de control: es una etiqueta, no un documento.
  const t = x.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return t.length > 0 ? t.slice(0, max) : undefined;
};

function entidadValida(x: unknown): EntidadProto | undefined {
  if (!obj(x) || !esTipoEntidad(x.tipo)) return undefined;
  const id = limpio(x.id, MAX_ID);
  if (!id) return undefined;
  const nombre = limpio(x.nombre, MAX_NOMBRE);
  return nombre ? { tipo: x.tipo, id, nombre } : { tipo: x.tipo, id };
}

/** Lo que llega por el evento → anuncio válido, o `null` si no trae nada utilizable. */
export function normalizarAnuncio(detalle: unknown): AnuncioContexto | null {
  if (!obj(detalle)) return null;
  const a: AnuncioContexto = {};
  const ruta = limpio(detalle.ruta, MAX_RUTA);
  if (ruta && ruta.startsWith("/")) a.ruta = ruta;
  if ("entidad" in detalle) {
    const e = entidadValida(detalle.entidad);
    if (e) a.entidad = e; else if (detalle.entidad === null) a.entidad = null;
  }
  if ("gobernadaPor" in detalle) {
    const g = entidadValida(detalle.gobernadaPor);
    if (g) a.gobernadaPor = g; else if (detalle.gobernadaPor === null) a.gobernadaPor = null;
  }
  if ("seleccion" in detalle) {
    const s = detalle.seleccion;
    if (obj(s) && esTipoSeleccion(s.tipo) && limpio(s.id, MAX_ID)) {
      const resumen = limpio(s.resumen, MAX_RESUMEN);
      a.seleccion = resumen ? { tipo: s.tipo, id: limpio(s.id, MAX_ID)!, resumen } : { tipo: s.tipo, id: limpio(s.id, MAX_ID)! };
    } else if (s === null) a.seleccion = null;
  }
  if (esAmbito(detalle.ambito)) a.ambito = detalle.ambito;
  return Object.keys(a).length > 0 ? a : null;
}

/** Une un anuncio sobre el contexto base de la ruta. Un campo `null` lo quita. */
export function fusionarContexto(base: ContextoProto, a: AnuncioContexto | null): ContextoProto {
  if (!a) return base;
  const fin: ContextoProto = { ...base };
  if (a.ruta) fin.ruta = a.ruta;
  if (a.ambito) fin.ambito = a.ambito;
  for (const k of ["entidad", "gobernadaPor", "seleccion"] as const) {
    if (!(k in a)) continue;
    const v = a[k];
    if (v === null) delete fin[k];
    else if (v !== undefined) (fin as unknown as Record<string, unknown>)[k] = v;
  }
  return fin;
}

/** Acumula un anuncio nuevo sobre el anterior de la MISMA pantalla (si no, el nuevo manda solo). */
export function acumularAnuncio(previo: AnuncioContexto | null, nuevo: AnuncioContexto, rutaDelNuevo: string): AnuncioContexto {
  const mismaPantalla = previo && (previo.ruta ?? rutaDelNuevo) === rutaDelNuevo;
  const sumado: AnuncioContexto = mismaPantalla ? { ...previo, ...nuevo } : { ...nuevo };
  sumado.ruta = rutaDelNuevo;
  return sumado;
}

export const nombreEntidad = (e: EntidadProto): string => e.nombre?.trim() || e.id;

/** «Grupo · Semilla». */
export const etiquetaEntidad = (e: EntidadProto): string => `${ETIQUETA_ENTIDAD[e.tipo]} · ${nombreEntidad(e)}`;

/** Lo que se ve en el chip: la entidad, o la pantalla si no hay. */
export function etiquetaContexto(c: ContextoProto): string {
  if (c.entidad) return etiquetaEntidad(c.entidad);
  return c.ruta && c.ruta !== "/" ? `Esta pantalla · ${c.ruta.length > 28 ? `${c.ruta.slice(0, 27)}…` : c.ruta}` : "Esta pantalla";
}

export function etiquetaSeleccion(s: NonNullable<ContextoProto["seleccion"]>): string {
  const tipo = esTipoEntidad(s.tipo) ? ETIQUETA_ENTIDAD[s.tipo] : ETIQUETA_SELECCION[s.tipo as keyof typeof ETIQUETA_SELECCION];
  return s.resumen ? `${tipo}: ${s.resumen}` : tipo;
}

/** La entidad con gobierno propio que manda aquí: la que gobierna lo de delante, o la propia si es grupo, comunidad o página. */
export function entidadGobernante(c: ContextoProto): EntidadProto | undefined {
  if (c.gobernadaPor && GOBERNANTES.includes(c.gobernadaPor.tipo)) return c.gobernadaPor;
  if (c.entidad && GOBERNANTES.includes(c.entidad.tipo)) return c.entidad;
  return undefined;
}

/**
 * Quién pide el cambio para el gobierno. La ventana no conoce el rol de la persona en la entidad (lo dará el
 * contexto de la petición cuando exista): en lo personal es el dueño; en lo demás, un miembro sin rol conocido.
 * Si lo interpreta Astraura, el origen es `ia` (siempre se confirma); si lo pulsó la persona, `humano`.
 */
export function actorDeLaVentana(c: ContextoProto, origen: OrigenPlan): ActorProto {
  return { usuarioId: null, rol: null, esDueno: c.ambito === "personal" || c.ambito === "perfil", origen: origen === "ia" ? "ia" : "humano" };
}
