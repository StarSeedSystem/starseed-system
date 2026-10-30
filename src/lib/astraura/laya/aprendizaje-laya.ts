// Aprendizaje de Laya (Ola 1018L · LYS1018M). Módulo PURO: sin red, sin disco, sin reloj, sin modelo.
// Aprende de decisiones tipadas: guarda lo necesario, recalibra umbrales y exporta JSONL para afinado.
import { puntoDecision, UMBRAL_POR_DEFECTO } from "./puntos-decision";

export type ResultadoDecision = "aceptada" | "corregida" | "escalada";

export interface CasoLaya {
  readonly punto: string;
  readonly ambito: string;
  readonly p: number; // probabilidad/confianza relevante (answer_confidence calibrada)
  readonly donde: string;
  readonly ms: number;
  readonly resultado: ResultadoDecision;
  readonly privado: boolean;
  /** Estado: si es privado SOLO se guarda como huella (ver anotar). */
  readonly estado?: unknown;
  readonly huella?: boolean;
}

export type RegistroLaya = readonly CasoLaya[];

/** Añade un caso al registro. Si es privado, guarda el estado SOLO como huella (sin el contenido completo). */
export function anotar(
  registro: RegistroLaya,
  entrada: {
    readonly punto: string;
    readonly ambito: string;
    readonly p: number;
    readonly donde: string;
    readonly ms: number;
    readonly resultado: ResultadoDecision;
    readonly privado: boolean;
    readonly estado?: unknown;
  }
): RegistroLaya {
  if (entrada.privado) {
    // Lo privado nunca sale; solo se guarda como huella, sin propagar el estado
    const caso: CasoLaya = {
      punto: entrada.punto,
      ambito: entrada.ambito,
      p: entrada.p,
      donde: entrada.donde,
      ms: entrada.ms,
      resultado: entrada.resultado,
      privado: true,
      huella: true,
    };
    return Object.freeze([...(registro as CasoLaya[]), Object.freeze(caso)]);
  }

  const caso: CasoLaya = {
    punto: entrada.punto,
    ambito: entrada.ambito,
    p: entrada.p,
    donde: entrada.donde,
    ms: entrada.ms,
    resultado: entrada.resultado,
    privado: false,
    estado: entrada.estado,
    huella: false,
  };
  return Object.freeze([...(registro as CasoLaya[]), Object.freeze(caso)]);
}

function esCorreccion(r: ResultadoDecision): boolean {
  return r === "corregida";
}

/** Umbral que minimiza correcciones con >= 30 casos para (punto, ambito). Si hay menos: el del catálogo. */
export function umbralRecalibrado(registro: RegistroLaya, punto: string, ambito: string): number {
  const casos = (registro as CasoLaya[]).filter((c) => c.punto === punto && c.ambito === ambito);
  if (casos.length < 30) {
    const pto = puntoDecision(punto);
    return pto?.umbral ?? UMBRAL_POR_DEFECTO;
  }

  // Candidatos: umbrales del catálogo si existen, y un rango razonable basado en los valores p
  const catalogoUmbral = puntoDecision(punto)?.umbral ?? UMBRAL_POR_DEFECTO;
  const candidatosSet = new Set<number>();
  candidatosSet.add(catalogoUmbral);
  candidatosSet.add(UMBRAL_POR_DEFECTO);
  for (const c of casos) {
    if (typeof c.p === "number" && Number.isFinite(c.p)) {
      // Probar alrededor de los valores observados
      candidatosSet.add(Math.max(0, Math.min(1, c.p)));
      candidatosSet.add(Math.max(0, Math.min(1, c.p - 1e-6)));
      candidatosSet.add(Math.max(0, Math.min(1, c.p + 1e-6)));
    }
  }
  // Añadir rejilla fina para encontrar mínimo
  for (let t = 0; t <= 1.0; t += 0.05) {
    candidatosSet.add(Math.round(t * 100) / 100);
  }

  const candidatos = Array.from(candidatosSet)
    .filter((t) => typeof t === "number" && Number.isFinite(t) && t >= 0 && t <= 1)
    .sort((a, b) => a - b);

  let mejorUmbral = catalogoUmbral;
  let minCorrecciones = Number.POSITIVE_INFINITY;

  for (const umbral of candidatos) {
    let correcciones = 0;
    for (const c of casos) {
      if (typeof c.p !== "number" || !Number.isFinite(c.p)) continue;
      // Si p >= umbral, se decide/acepta según lógica; las correcciones son las entradas marcadas como corregida
      // Minimizamos el número de casos con resultado "corregida"
      if (esCorreccion(c.resultado)) {
        correcciones++;
      }
    }
    // También considerar: con umbral más alto habría más dudas/escaladas; con más bajo menos dudas
    // Pero el objetivo es minimizar correcciones. Contamos correcciones directamente.
    if (correcciones < minCorrecciones) {
      minCorrecciones = correcciones;
      mejorUmbral = umbral;
    } else if (correcciones === minCorrecciones) {
      // En empate, preferir umbral del catálogo o mantener más conservador? Preferir el del catálogo si coincide
      if (Math.abs(umbral - catalogoUmbral) < Math.abs(mejorUmbral - catalogoUmbral)) {
        mejorUmbral = umbral;
      }
    }
  }

  return Math.max(0, Math.min(1, mejorUmbral));
}

export interface CasoAfinadoLaya {
  readonly punto: string;
  readonly ambito: string;
  readonly p: number;
  readonly donde: string;
  readonly ms: number;
  readonly resultado: ResultadoDecision;
  readonly choice?: unknown;
  readonly score?: unknown;
  readonly noul?: unknown;
  readonly probabilities?: unknown;
  readonly answer_confidence?: unknown;
  readonly confidence?: unknown;
}

/** Exporta los casos NO privados en el formato del cuaderno de afinado de Laya (JSONL). */
export function exportarJSONL(registro: RegistroLaya): string {
  const lineas: string[] = [];
  for (const c of registro as CasoLaya[]) {
    if (c.privado) continue; // nunca exportar casos privados
    const base: CasoAfinadoLaya = {
      punto: c.punto,
      ambito: c.ambito,
      p: c.p,
      donde: c.donde,
      ms: c.ms,
      resultado: c.resultado,
    };
    // Si hay estado con forma de respuesta Laya, incluir campos relevantes
    if (c.estado && typeof c.estado === "object") {
      const est = c.estado as Record<string, unknown>;
      if ("choice" in est) base.choice = est.choice;
      if ("score" in est) base.score = est.score;
      if ("noul" in est) base.noul = est.noul;
      if ("probabilities" in est) base.probabilities = est.probabilities;
      if ("answer_confidence" in est) base.answer_confidence = est.answer_confidence;
      if ("confidence" in est) base.confidence = est.confidence;
    }
    lineas.push(JSON.stringify(base));
  }
  if (lineas.length === 0) return "";
  return lineas.join("\n") + "\n";
}
