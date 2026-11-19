// Aceptación pura de archivos/carpetas/sincronización de cerebros entrantes por la malla.
// Contrato:
// - Toda entrada entrante pide aceptación con nombre, tamaño, tipo real, neurona de origen y medio.
// - Una neurona conocida acepta sin preguntar (configuración por neurona, apagada por defecto).
// - Desconocida ⇒ SIEMPRE preguntar a mano.
// - Nunca se acepta solo por neurona desconocida sin aprobación explícita.
// - Lo recibido queda en cuarentena hasta aceptar (y analizar si así se eligió).

export type TipoEntrada = "archivo" | "carpeta" | "cerebro-sincronizado";

export interface MetadataEntrada {
  id: string;
  nombre: string;
  tamano: number;
  tipoReal: string;
  neuronaOrigen: string;
  medio: string;
}

export type EstadoAceptacion = "pendiente" | "aceptado" | "rechazado";

export interface Entrada {
  metadata: MetadataEntrada;
  esNeuronaReconocida: boolean;
  aceptacion?: {
    aceptado: boolean;
    razon?: string;
  };
}

export interface NeuronaConocida {
  id: string;
  aceptacionSinPreguntar: boolean;
}

export interface ConfigAceptacion {
  neuronasConocidas: NeuronaConocida[];
}

export interface ResultadoAceptacion {
  aceptado: boolean;
  razon: string;
}

export function aceptarEntrada(
  entrada: Entrada,
  config: ConfigAceptacion,
  preguntaManual?: boolean,
): ResultadoAceptacion {
  const neurona = config.neuronasConocidas.find((n) => n.id === entrada.metadata.neuronaOrigen);
  const esReconocida = neurona !== undefined;

  if (!esReconocida) {
    return {
      aceptado: false,
      razon: `Neurona desconocida: ${entrada.metadata.neuronaOrigen}. Requiere aprobación manual.`,
    };
  }

  if (neurona.aceptacionSinPreguntar) {
    return {
      aceptado: true,
      razon: `Neurona conocida (${neurona.id}) aceptada sin preguntar.`,
    };
  }

  if (preguntaManual === true) {
    return {
      aceptado: true,
      razon: `Aceptado manualmente por el usuario para la neurona conocida: ${neurona.id}.`,
    };
  }

  return {
    aceptado: false,
    razon: `Se requiere aprobación manual para la neurona conocida: ${neurona.id}.`,
  };
}

export function actualizarAceptacion(
  entrada: Entrada,
  resultado: ResultadoAceptacion,
): Entrada {
  return {
    ...entrada,
    aceptacion: {
      aceptado: resultado.aceptado,
      razon: resultado.razon,
    },
  };
}

export function esAceptada(entrada: Entrada): boolean {
  return entrada.aceptacion?.aceptado === true;
}

export function obtenerEntradaEnCuarentena(entradas: Entrada[]): Entrada[] {
  return entradas.filter((e) => !e.aceptacion || !e.aceptacion.aceptado);
}

export function tieneConfiguracionPorDefecto(config: ConfigAceptacion): boolean {
  return config.neuronasConocidas.some((n) => n.aceptacionSinPreguntar);
}