// Cableado del registro de Laya en la ruta `/api/astraura/decidir` (JLA1116A §2 y §8, fase 1).
// El registro de `aprendizaje-laya.ts` EXISTE, pero NADA lo alimentaba: `anotar` no tenía
// llamador fuera de las pruebas y el panel recibía un registro vacío. Aquí, de lo que la ruta
// midió sale la entrada del caso y el almacén —INYECTADO— la guarda. Lo privado: solo huella.
// PURO: sin red, sin disco y sin reloj (el `ts` lo pone la ruta).
import { registrar, type EntradaDecision } from "./registro-decision";
import type { CasoLaya, RegistroAprendizaje } from "./aprendizaje-laya";
import { MEDIOS_LAYA, puntoDecision, type MedioLaya } from "./puntos-decision";

/** Ámbito por defecto: el de la neurona de la persona (el panel usa el mismo). */
export const AMBITO_POR_DEFECTO = "personal";

/** Tope de casos guardados (los más recientes): el archivo no crece sin fin. */
export const MAX_CASOS_REGISTRO = 500;

/** El almacén del registro lo inyecta quien llama: disco en la ruta, memoria en las pruebas. */
export interface AlmacenRegistro {
  leer(): Promise<RegistroAprendizaje>;
  escribir(registro: RegistroAprendizaje): Promise<void>;
}

/** Lo que la ruta midió de una decisión y lo que hay que aprender de ello. */
export interface DatosRuta {
  /** Ámbito donde se decidió (cuenta, página o grupo); si no viene, el personal. */
  readonly ambito?: string;
  /** Acción del plan final («ejecutar», «confirmar», «escalar_jev», «escalar_llm»). */
  readonly accion: string;
  /** Capa «reflejo.herramienta» (elige herramienta): confianza CALIBRADA y ms; null si no respondió. */
  readonly laya: { readonly confianza: number; readonly ms: number } | null;
  /** Capa «habilidad.elegir» (elige la habilidad): confianza CALIBRADA y ms; null si no respondió. */
  readonly habilidad: { readonly confianza: number; readonly ms: number } | null;
  /** El estado sobre el que se decidió (la consulta). */
  readonly estado: string;
  /** Dónde corrió Laya: el medio con el que la ruta la pregunta. */
  readonly donde: MedioLaya;
  /** Marca de tiempo inyectada por quien llama (aquí no se lee el reloj). */
  readonly ts?: number;
}
/**
 * Entradas del registro que salen de una respuesta de la ruta: una por cada capa de Laya que
 * respondió. La capa «tipo de diagrama» NO se anota: usa el punto «habilidad.elegir» con otra
 * pregunta (`decision-hibrida.ts`), y mezclarlas en el mismo punto falsearía su umbral.
 */
export function entradasDeRuta(datos: DatosRuta): EntradaDecision[] {
  const escalo = datos.accion.startsWith("escalar_");
  const ambito = datos.ambito?.trim() || AMBITO_POR_DEFECTO;
  const capas: readonly { punto: string; dato: DatosRuta["laya"] }[] = [
    { punto: "reflejo.herramienta", dato: datos.laya },
    { punto: "habilidad.elegir", dato: datos.habilidad },
  ];
  const entradas: EntradaDecision[] = [];
  for (const capa of capas) {
    if (!capa.dato) continue;
    const base: EntradaDecision = {
      punto: capa.punto, ambito, answer_confidence: capa.dato.confianza,
      donde: datos.donde, ms: capa.dato.ms, escalo, estado: datos.estado,
    };
    entradas.push(datos.ts === undefined ? base : { ...base, ts: datos.ts });
  }
  return entradas;
}

/** Resultado de anotar casos: el registro entero y cuántos se han anotado de verdad. */
export interface ResultadoRegistro {
  readonly registro: RegistroAprendizaje;
  readonly guardados: number;
}

/**
 * Anota las entradas en el registro (con `registrar`, que usa `anotar`) y lo guarda: una
 * lectura y una escritura. Si una entrada no se puede construir (punto desconocido, confianza
 * que no es un número de 0 a 1) no se anota nada ni se inventa un caso.
 */
export async function registrarCasos(almacen: AlmacenRegistro, entradas: readonly EntradaDecision[]): Promise<ResultadoRegistro> {
  let registro = await almacen.leer();
  let guardados = 0;
  for (const entrada of entradas) {
    const siguiente = registrar(registro, entrada);
    if (siguiente.length === registro.length) continue; // el caso no se pudo construir
    registro = siguiente;
    guardados++;
  }
  if (guardados === 0) return { registro, guardados };
  const acotado = registro.slice(-MAX_CASOS_REGISTRO);
  await almacen.escribir(acotado);
  return { registro: acotado, guardados };
}

/** Convierte lo leído del disco en casos válidos: lo que no encaja se descarta, nada se inventa. */
export function normalizarRegistro(crudo: unknown): RegistroAprendizaje {
  if (!Array.isArray(crudo)) return [];
  const casos: CasoLaya[] = [];
  for (const item of crudo as unknown[]) {
    const caso = casoNormalizado(item);
    if (caso) casos.push(caso);
  }
  return casos.slice(-MAX_CASOS_REGISTRO);
}

/** Un caso del disco solo vale si tiene todos sus campos bien; si no, se descarta. */
function casoNormalizado(item: unknown): CasoLaya | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const punto = typeof o.punto === "string" ? o.punto : "";
  const ambito = typeof o.ambito === "string" ? o.ambito : "";
  const p = o.p;
  const donde = o.donde;
  const resultado = o.resultado;
  if (!puntoDecision(punto) || !ambito) return null;
  if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1) return null;
  if (typeof donde !== "string" || !MEDIOS_LAYA.includes(donde as MedioLaya)) return null;
  if (resultado !== "aceptada" && resultado !== "corregida" && resultado !== "escalada") return null;
  const base: CasoLaya = {
    punto, ambito, p, donde: donde as MedioLaya, resultado,
    ms: typeof o.ms === "number" && Number.isFinite(o.ms) ? Math.max(0, Math.round(o.ms)) : 0,
    estado: typeof o.estado === "string" ? o.estado : "",
    privado: o.privado === true,
  };
  return typeof o.ts === "number" && Number.isFinite(o.ts) ? { ...base, ts: o.ts } : base;
}
