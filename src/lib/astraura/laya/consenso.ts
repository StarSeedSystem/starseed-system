// Consenso entre los modelos pequeños de 1,58 bits (BitNet, Bonsai, Needle) y Laya
// (architecture/laya-y-habilidades.md §4, Ola 1018L · LYS1018C).
//
// Módulo PURO: sin red, sin disco, sin reloj y sin cargar modelos. La misma pregunta
// tipada se lanza a los dos: si coinciden, vale; si no, manda Laya solo con su
// `answer_confidence` (calibrada) por encima del umbral; si Laya no llegó a tiempo, se
// acepta lo pequeño solo si su confianza también alcanza el umbral. En cualquier otro
// caso se escala a la capa siguiente. Nunca se usa `confidence` como si fuera
// `answer_confidence`, y lo privado no sale de aquí hacia ningún sitio.

export type RespuestaConsenso = string | number;
export type QuienConsenso = "ambos" | "laya" | "pequeno" | "ninguno";
export type AccionConsenso = "aceptar" | "escalar";

export interface RespuestaPequena {
  /** Valor elegido por el modelo pequeño (`choice`, `score` o `noul`). */
  readonly respuesta: RespuestaConsenso;
  /** Confianza propia del modelo pequeño, sin calibrar; opcional porque no todos la dan. */
  readonly confianza?: number;
  readonly motor: string;
}

export interface RespuestaLLaya {
  /** Valor de la decisión (`choice`, `score` o `noul`), ya extraído de la respuesta real. */
  readonly respuesta: RespuestaConsenso;
  /** Confianza calibrada de Laya: es la única que decide con umbral. */
  readonly answer_confidence: number;
}

export interface ResultadoConsenso {
  readonly decision: RespuestaConsenso | null;
  readonly quien: QuienConsenso;
  readonly accion: AccionConsenso;
  readonly motivo: string;
}

export interface EntradaConsenso {
  readonly pequeno: RespuestaPequena;
  readonly laya: RespuestaLLaya | null;
  readonly umbral?: number;
}

/** Umbral por defecto, alineado con `UMBRAL_POR_DEFECTO` del catálogo de puntos. */
export const UMBRAL_CONSENSO = 0.6;

const confiable = (c: number | undefined, umbral: number): c is number =>
  typeof c === "number" && Number.isFinite(c) && c >= umbral;

const texto = (c: number | undefined): string =>
  typeof c === "number" && Number.isFinite(c) ? c.toFixed(2) : "sin confianza";

/** Igualdad tolerante a mayúsculas y espacios; los números se comparan tal cual. */
const misma = (a: RespuestaConsenso, b: RespuestaConsenso): boolean =>
  typeof a === "string" && typeof b === "string"
    ? a.trim().toLocaleLowerCase("es") === b.trim().toLocaleLowerCase("es")
    : Object.is(a, b);

export function consensuar(entrada: EntradaConsenso): ResultadoConsenso {
  const { pequeno, laya } = entrada;
  const umbral = entrada.umbral ?? UMBRAL_CONSENSO;
  if (!Number.isFinite(umbral) || umbral < 0 || umbral > 1) {
    throw new RangeError(`El umbral debe estar entre 0 y 1 (recibido: ${String(umbral)})`);
  }

  if (laya && misma(pequeno.respuesta, laya.respuesta)) {
    return {
      decision: pequeno.respuesta,
      quien: "ambos",
      accion: "aceptar",
      motivo: `Coinciden ${pequeno.motor} y Laya: se acepta sin escalar`,
    };
  }

  if (laya) {
    if (confiable(laya.answer_confidence, umbral)) {
      return {
        decision: laya.respuesta,
        quien: "laya",
        accion: "aceptar",
        motivo: `No coinciden; manda Laya (answer_confidence ${texto(laya.answer_confidence)} ≥ ${texto(umbral)})`,
      };
    }
    return {
      decision: null,
      quien: "ninguno",
      accion: "escalar",
      motivo: `No coinciden y Laya no alcanza el umbral (answer_confidence ${texto(laya.answer_confidence)} < ${texto(umbral)}): se escala`,
    };
  }

  if (confiable(pequeno.confianza, umbral)) {
    return {
      decision: pequeno.respuesta,
      quien: "pequeno",
      accion: "aceptar",
      motivo: `Laya no llegó a tiempo; ${pequeno.motor} alcanza el umbral (${texto(pequeno.confianza)} ≥ ${texto(umbral)}): se acepta`,
    };
  }
  return {
    decision: null,
    quien: "ninguno",
    accion: "escalar",
    motivo: `Laya no llegó a tiempo y ${pequeno.motor} no alcanza el umbral (${texto(pequeno.confianza)} < ${texto(umbral)}): se escala`,
  };
}
