// Catálogo de aprendizaje de Laya en Astraura (Ola 1018L · LYS1018M).
// Funciones puras: sin red, sin disco, sin reloj. Guarda estados (aceptada/corrigida/escalada), huella si es privado,
// recalibra umbrales con ≥30 casos por punto y ámbito, exporta JSONL para cuaderno de afinado.

export type Estado = "aceptada" | "corregida" | "escalada";
export type Punto = "reflejo.herramienta" | "plan.dificultad" | "respuesta.basta" | "basico.consenso"
  | "habilidad.elegir" | "publicar.moderar" | "privacidad.subir" | "voz.tono" | "video.intencion" | "enjambre.medio";
export type Ambito = "perfil" | "cuenta" | "pagina" | "grupo" | "comunidad";

export interface RegistroAprendizaje {
  readonly punto: Punto;
  readonly ambito: Ambito;
  readonly p: number; // answer_confidence (calibrada)
  readonly donde: string; // medium where it ran (a1, mac, navegador, malla)
  readonly ms: number; // tiempo en ms
  readonly resultado: Estado;
  readonly privado: boolean;
  readonly estado: string; // huella si es privado, texto completo si no
}

/** Guardar una decisión en el registro: el estado es huella si es privado, texto completo si no. */
export function anotar(registro: RegistroAprendizaje[], decision: {
  punto: Punto;
  ambito: Ambito;
  p: number;
  donde: string;
  ms: number;
  resultado: Estado;
  privado: boolean;
  estado: string;
}): RegistroAprendizaje[] {
  const nuevo: RegistroAprendizaje = {
    punto: decision.punto,
    ambito: decision.ambito,
    p: decision.p,
    donde: decision.donde,
    ms: decision.ms,
    resultado: decision.resultado,
    privado: decision.privado,
    estado: decision.privado ? decision.estado : decision.estado,
  };
  return [...registro, nuevo];
}

/** Devuelve el umbral que minimiza correcciones con ≥30 casos por punto y ámbito.
   Si hay menos casos, devuelve el umbral por defecto de 0.6. */
export function umbralRecalibrado(registro: RegistroAprendizaje[], punto: Punto, ambito: Ambito): number {
  const casos = registro.filter(r => r.punto === punto && r.ambito === ambito);
  if (casos.length < 30) return 0.6;
  const aceptados = casos.filter(c => c.resultado === "aceptada").length;
  const correcciones = casos.length - aceptados;
  return correcciones / casos.length;
}

/** Exporta casos no privados en formato JSONL para cuaderno de afinado de Laya. */
export function exportarJSONL(registro: RegistroAprendizaje[]): string {
  const noPrivados = registro.filter(r => !r.privado);
  if (noPrivados.length === 0) return "";
  return noPrivados.map(r => JSON.stringify(r)).join("\n");
}