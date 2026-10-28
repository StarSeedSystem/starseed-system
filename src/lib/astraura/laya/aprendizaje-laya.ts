export type ResultadoDecisión = "aceptada" | "corregida" | "escalada";
export type EstadoAprendizaje = "aprendiendo" | "estable" | "recalibrado";
export type Ambito = string;
export type PuntoDecisiónId = string;

export interface RegistroAprendizaje {
  readonly casos: ReadonlyArray<CasoAprendizaje>;
  readonly umbrales: Readonly<Record<string, Record<string, number>>>;
}

export interface CasoAprendizaje {
  readonly punto: PuntoDecisiónId;
  readonly ambito: Ambito;
  readonly p: number;
  readonly donde: string;
  readonly ms: number;
  readonly resultado: ResultadoDecisión;
  readonly privado?: boolean;
  readonly estado: EstadoAprendizaje;
  readonly huella?: string;
}

export interface Anotación {
  punto: PuntoDecisiónId;
  ambito: Ambito;
  p: number;
  donde: string;
  ms: number;
  resultado: ResultadoDecisión;
  privado?: boolean;
  estado: EstadoAprendizaje;
}

export function anotar(registro: RegistroAprendizaje, anotación: Anotación): RegistroAprendizaje {
  const { punto, ambito, p, donde, ms, resultado, privado, estado } = anotación;
  
  const casoBase: Omit<CasoAprendizaje, "huella"> = {
    punto,
    ambito,
    p,
    donde,
    ms,
    resultado,
    privado,
    estado,
  };

  const caso: CasoAprendizaje = privado
    ? {
        ...casoBase,
        huella: generarHuella({ punto, ambito, p, donde, ms, resultado, estado }),
        privado: true,
      }
    : { ...casoBase };

  return {
    casos: [...registro.casos, caso],
    umbrales: { ...registro.umbrales },
  };
}

function generarHuella(datos: Record<string, unknown>): string {
  const texto = JSON.stringify(datos);
  let hash = 0;
  for (let i = 0; i < texto.length; i++) {
    const char = texto.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function umbralRecalibrado(
  registro: RegistroAprendizaje,
  punto: PuntoDecisiónId,
  ambito: Ambito
): number {
  const casos = registro.casos.filter(c => c.punto === punto && c.ambito === ambito && !c.privado);
  
  if (casos.length < 30) {
    return obtenerUmbralCatalogo(punto, ambito, registro.umbrales);
  }

  const correcciones = umbralQueMinimizaCorrecciones(casos);
  return correcciones;
}

function obtenerUmbralCatalogo(
  punto: PuntoDecisiónId,
  ambito: Ambito,
  umbrales: RegistroAprendizaje["umbrales"]
): number {
  return umbrales[punto]?.[ambito] ?? 0.6;
}

function umbralQueMinimizaCorrecciones(casos: CasoAprendizaje[]): number {
  const puntos = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  let mejorUmbral = 0.6;
  let minCorrecciones = Infinity;

  for (const umbral of puntos) {
    let correcciones = 0;
    for (const caso of casos) {
      const aceptaria = caso.p >= umbral;
      const fueCorregida = caso.resultado === "corregida";
      const fueEscalada = caso.resultado === "escalada";
      
      if (aceptaria && (fueCorregida || fueEscalada)) {
        correcciones++;
      }
      if (!aceptaria && caso.resultado === "aceptada") {
        correcciones++;
      }
    }
    
    if (correcciones < minCorrecciones) {
      minCorrecciones = correcciones;
      mejorUmbral = umbral;
    }
  }

  return mejorUmbral;
}

export function exportarJSONL(registro: RegistroAprendizaje): string {
  const casosPublicos = registro.casos.filter(c => !c.privado);
  
  return casosPublicos
    .map(caso => {
      const registroExport = {
        punto: caso.punto,
        ambito: caso.ambito,
        p: caso.p,
        donde: caso.donde,
        ms: caso.ms,
        resultado: caso.resultado,
        estado: caso.estado,
      };
      return JSON.stringify(registroExport);
    })
    .join("\n");
}
