// Centinela de archivos para la malla cristalina (SiO₂ amorfo).
// Contrato: peligroso o cuarentena → rechazar; sospechoso o aviso → avisar con motivos;
// si no, lo de siempre: aceptar-con-pregunta.

export type Nivel = 'limpio' | 'sospechoso' | 'peligroso';

export interface AnalisisEntrada {
  nivel: Nivel;
  motivos: string[];
}

export interface ResonanciaEntrada {
  decision: 'cuarentena' | 'aviso' | 'limpio' | 'sin-datos';
}

export type AccionEntrada = 'aceptar-con-pregunta' | 'avisar' | 'rechazar';

export interface ResultadoEntrada {
  accion: AccionEntrada;
  texto: string;
}

/**
 * Decisión de entrada de un archivo por la malla.
 * - Peligroso o cuarentena → rechazar.
 * - Sospechoso o aviso → avisar con los motivos.
 * - De lo contrario → aceptar con pregunta.
 */
export function decidirEntrada(
  analisis: AnalisisEntrada,
  resonancia: ResonanciaEntrada | null,
): ResultadoEntrada {
  const nivel = analisis.nivel;
  const motivos = analisis.motivos;

  // Peligroso o cuarentena → rechazar con motivo.
  if (nivel === 'peligroso') {
    return {
      accion: 'rechazar',
      texto: motivos.length > 0 ? motivos.join('; ') : 'Archivo peligroso detectado.',
    };
  }
  if (resonancia && resonancia.decision === 'cuarentena') {
    return {
      accion: 'rechazar',
      texto: `En CUARENTENA de la red: archivo bloqueado por consenso.`,
    };
  }

  // Sospechoso o aviso → avisar con los motivos.
  if (nivel === 'sospechoso') {
    return {
      accion: 'avisar',
      texto: motivos.length > 0 ? motivos.join('; ') : 'Archivo sospechoso.',
    };
  }
  if (resonancia && resonancia.decision === 'aviso') {
    return {
      accion: 'avisar',
      texto: motivos.length > 0 ? motivos.join('; ') : 'Aviso de la red sobre este archivo.',
    };
  }

  // De lo contrario → aceptar con pregunta.
  return {
    accion: 'aceptar-con-pregunta',
    texto: '¿Aceptar este archivo?',
  };
}
