// Centinela de archivos — la decisión de la malla ANTES de aceptar un archivo
// que llega de otro aparato: une el análisis local del centinela
// (`analizarArchivo`) con la resonancia de la red (`decisionPorResonancia`).
// Contrato: §4 (capa 5, «Centinela») y §5.6 («Resonancias») de
// `architecture/malla-cristalina-sio2.md`. Módulo puro: sin node:*, sin red.
import type { Nivel } from './centinela';
import type { DecisionResonancia } from './resonancias';

/** Qué hace la malla con el archivo que llega. */
export type AccionEntrada = 'aceptar-con-pregunta' | 'avisar' | 'rechazar';

/** Análisis local del centinela: el nivel y los motivos que lo justifican. */
export interface AnalisisEntrada {
  nivel: Nivel;
  motivos: string[];
}

/** La resonancia de la red sobre el hash del archivo: solo su decisión. */
export interface ResonanciaEntrada {
  decision: DecisionResonancia;
}

/** Decisión de entrada: la acción a tomar y el texto que se le enseña a la persona. */
export interface DecisionEntrada {
  accion: AccionEntrada;
  texto: string;
}

/** Une los motivos en un texto legible; nunca devuelve una lista vacía a ciegas. */
function enumerar(motivos: string[]): string {
  const limpios = motivos.filter((m) => m.trim().length > 0);
  return limpios.length > 0 ? limpios.join('; ') : 'sin motivos detallados';
}

/**
 * decidirEntrada — peligroso local o cuarentena de la red ⇒ rechazar;
 * sospechoso local o aviso de la red ⇒ avisar con los motivos; si no, lo de
 * siempre: preguntar antes de aceptar.
 */
export function decidirEntrada(
  analisis: AnalisisEntrada,
  resonancia: ResonanciaEntrada | null,
): DecisionEntrada {
  // 1. Rechazar: análisis local peligroso o consenso de cuarentena de la red.
  const enCuarentena = resonancia?.decision === 'cuarentena';
  if (analisis.nivel === 'peligroso' || enCuarentena) {
    const motivos = [...analisis.motivos];
    if (enCuarentena) motivos.push('la resonancia de la red lo pone en cuarentena');
    return {
      accion: 'rechazar',
      texto: `El centinela rechaza el archivo: ${enumerar(motivos)}.`,
    };
  }
  // 2. Avisar: sospechas locales o aviso de la red — los motivos van con el aviso.
  if (analisis.nivel === 'sospechoso' || resonancia?.decision === 'aviso') {
    const motivos = [...analisis.motivos];
    if (resonancia?.decision === 'aviso') motivos.push('la resonancia de la red marca un aviso');
    return {
      accion: 'avisar',
      texto: `Aviso del centinela: ${enumerar(motivos)}.`,
    };
  }
  // 3. Lo de siempre: sin avisos, se pregunta antes de aceptar.
  return {
    accion: 'aceptar-con-pregunta',
    texto: 'Sin avisos del centinela.',
  };
}
