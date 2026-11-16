// Registro de decisiones de Laya: del resultado de `/api/astraura/decidir` a un caso aprendido.
// Informe JLA1116A §2 y §8 (fase 1): el registro de `aprendizaje-laya.ts` existe, pero NADA lo
// alimentaba — `anotar` no tenía llamador fuera de las pruebas. Este módulo es el puente puro:
// una decisión de Laya → un `CasoLaya` → anotado en el registro.
// PURA: sin red, sin disco, sin reloj (el `ts` lo inyecta quien llama) y sin cargas de modelo.
import { anotar, type CasoLaya, type RegistroAprendizaje } from "./aprendizaje-laya";
import { puntoDecision, type MedioLaya } from "./puntos-decision";

/** Lo que el llamador extrae de la respuesta de `POST /api/astraura/decidir` para una decisión de Laya. */
export interface EntradaDecision {
  /** Punto de decisión del catálogo (`puntos-decision.ts`): el que Laya respondió. */
  readonly punto: string;
  /** Ámbito donde se decidió (cuenta, página o grupo): agrupa los casos para recalibrar. */
  readonly ambito: string;
  /** Confianza CALIBRADA con la que se decidió (entre 0 y 1; nunca `confidence`). En la ruta es
   *  `capas.habilidad.confianza` (la calibrada) o `capas.laya.confianza`. */
  readonly answer_confidence: number;
  /** Dónde corrió Laya: el medio del catálogo (`a1`, `mac`, `navegador`, `malla`). */
  readonly donde: MedioLaya;
  /** Milisegundos que tardó la decisión. */
  readonly ms: number;
  /** true si al final se escaló a otra capa en vez de resolverla Laya (en la ruta, `plan.accion`
   *  empieza por «escalar_»). */
  readonly escalo: boolean;
  /** El estado sobre el que se decidió; si el punto es privado, se guarda SOLO como huella. */
  readonly estado: string;
  /** Marca de tiempo inyectada por quien llama (aquí no se lee el reloj). */
  readonly ts?: number;
}

/**
 * Convierte una decisión en el caso del registro (`architecture/laya-y-habilidades.md` §6):
 * `resultado` «aceptada» o «escalada» y `privado` según la privacidad del punto («solo-propias» ⇒
 * privado; lo privado se guarda solo como huella). Devuelve `null` cuando no se puede construir un
 * caso honesto: punto desconocido del catálogo (no se inventa la privacidad de un punto que no
 * existe) o `answer_confidence` que no es un número entre 0 y 1 (sin confianza calibrada no hay
 * nada que calibrar después).
 */
export function casoDeDecision(entrada: EntradaDecision): CasoLaya | null {
  const punto = puntoDecision(entrada.punto);
  if (!punto) return null;
  const p = entrada.answer_confidence;
  if (!Number.isFinite(p) || p < 0 || p > 1) return null;
  const caso: CasoLaya = {
    punto: punto.id,
    ambito: entrada.ambito,
    p,
    donde: entrada.donde,
    ms: entrada.ms,
    resultado: entrada.escalo ? "escalada" : "aceptada",
    estado: entrada.estado,
    privado: punto.privacidad === "solo-propias",
  };
  return entrada.ts === undefined ? caso : { ...caso, ts: entrada.ts };
}

/**
 * Anota la decisión en el registro con `anotar` (que guarda el estado privado SOLO como huella).
 * Si el caso no se puede construir, el registro vuelve tal cual: no se anota nada ni se inventa.
 */
export function registrar(registro: RegistroAprendizaje, entrada: EntradaDecision): RegistroAprendizaje {
  const caso = casoDeDecision(entrada);
  return caso ? anotar(registro, caso) : registro;
}
