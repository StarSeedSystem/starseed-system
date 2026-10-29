/**
 * Contenido vivo · AJUSTES POR ÁMBITO y LIBRO DE CRÉDITOS (tarea C de CVV1028).
 *
 * Módulo puro: sin red, sin disco y sin `node:*`, como `protomolecula/permisos.ts`.
 * La persistencia la decide quien llama; aquí solo se valida, se suma y se decide
 * si cabe un gasto. Contrato: `architecture/contenido-vivo.md` §4.
 */

/** Quién aprueba un gasto. En grupo o página sigue su gobierno (§0 del gobierno de la Protomolécula). */
export type ModoAprobacion = "yo" | "democratica" | "personas";

/** Ajustes de «Contenido vivo» de una cuenta, una página o un grupo. */
export interface AjustesContenidoVivo {
  /** La ruta local gana los empates (por defecto, contratos §3). */
  localPrimero: boolean;
  /** Servicios externos que el ámbito permite (ids del catálogo: spline-mcp, higgsfield…). */
  externosPermitidos: string[];
  /** Tope de créditos al mes. 0 significa «no se gasta». */
  topeCreditosMes: number;
  aprobacion: ModoAprobacion;
  /** Con «personas»: quién tiene permiso directo para aprobar gastos. */
  personas?: string[];
}

/** Un gasto anotado en el libro del ámbito. */
export interface AsientoCreditos {
  /** Momento del gasto (milisegundos). */
  t: number;
  /** Ámbito del libro: cuenta, página o grupo. */
  ambito: string;
  servicio: string;
  modelo: string;
  creditos: number;
  /** Tarea viva del catálogo (escena-3d, foto…). */
  tarea: string;
  /** Quién lo aprobó. */
  aprobadoPor: string;
}

/** Veredicto de un gasto, con motivo en lenguaje claro. */
export interface VeredictoGasto {
  si: boolean;
  motivo: string;
}

const MODOS: readonly ModoAprobacion[] = ["yo", "democratica", "personas"];

const textos = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.trim() !== ""))] : [];

const topeSano = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;

/**
 * Sanea lo que llega de fuera (nunca lanza): rellena lo que falta y recorta
 * los valores raros, como `normalizarReglas` del gobierno de la Protomolécula.
 */
export function validarAjustes(valor: unknown): AjustesContenidoVivo {
  const base = valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
  const modo = typeof base.aprobacion === "string" && MODOS.includes(base.aprobacion as ModoAprobacion)
    ? (base.aprobacion as ModoAprobacion)
    : "yo";
  const ajustes: AjustesContenidoVivo = {
    localPrimero: typeof base.localPrimero === "boolean" ? base.localPrimero : true,
    externosPermitidos: textos(base.externosPermitidos),
    topeCreditosMes: topeSano(base.topeCreditosMes),
    aprobacion: modo,
  };
  const personas = textos(base.personas);
  if (modo === "personas" && personas.length > 0) ajustes.personas = personas;
  return ajustes;
}

/** Suma los créditos del libro que caen en el mismo mes (año y mes) que «ahora». */
export function gastadoEnMes(asientos: AsientoCreditos[], ahora: number): number {
  if (!Array.isArray(asientos) || !Number.isFinite(ahora)) return 0;
  const marca = new Date(ahora);
  const mismoMes = (t: number): boolean => {
    const d = new Date(t);
    return d.getFullYear() === marca.getFullYear() && d.getMonth() === marca.getMonth();
  };
  return asientos.reduce((suma, a) => (a && Number.isFinite(a.creditos) && a.creditos > 0 && mismoMes(a.t) ? suma + a.creditos : suma), 0);
}

/**
 * Decide si el ámbito puede gastar lo cotizado. Sin tope no se gasta (§6:
 * jamás créditos sin cotización y sin un «sí»); «democratica» manda a la
 * propuesta, como el voto del gobierno de la Protomolécula.
 */
export function puedeGastar(
  ajustes: AjustesContenidoVivo,
  gastado: number,
  cotizacion: number,
  quien: string,
): VeredictoGasto {
  if (ajustes.topeCreditosMes <= 0) {
    return { si: false, motivo: "Este ámbito no tiene tope de créditos: nada se gasta hasta que pongas uno en los ajustes." };
  }
  if (!Number.isFinite(cotizacion) || cotizacion <= 0) {
    return { si: false, motivo: "Falta la cotización: se pide el precio antes de gastar." };
  }
  if (gastado + cotizacion > ajustes.topeCreditosMes) {
    const quedan = Math.max(0, ajustes.topeCreditosMes - gastado);
    return { si: false, motivo: `El gasto pasa del tope del mes: llevas ${gastado} de ${ajustes.topeCreditosMes} y la cotización pide ${cotizacion}; quedan ${quedan}.` };
  }
  if (ajustes.aprobacion === "democratica") {
    return { si: false, motivo: "El ámbito decide en democrático: hace falta una propuesta votada, como en el gobierno de la Protomolécula." };
  }
  if (ajustes.aprobacion === "personas") {
    if (!(ajustes.personas ?? []).includes(quien)) {
      return { si: false, motivo: `«${quien}» no está entre las personas con permiso para aprobar gastos.` };
    }
    return { si: true, motivo: "Permite directo vigente: el gasto se anota con tu nombre en el libro." };
  }
  return { si: true, motivo: "Gasto del propio ámbito, aprobado por su cuenta: se anota en el libro." };
}
