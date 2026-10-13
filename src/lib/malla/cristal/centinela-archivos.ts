import type { ResultadoAnalisis } from './centinela';
import type { DecisionResonancia } from './resonancias';

/**
 * Decide la entrada de un archivo a la malla basado en el análisis del Centinela
 * y la resonancia de la red.
 *
 * - Peligroso o cuarentena → rechazar
 * - Sospechoso o aviso → avisar con los motivos del análisis
 * - En cualquier otro caso → preguntar (aceptar-con-pregunta)
 */
export function decidirEntrada(
  analisis: ResultadoAnalisis,
  resonancia: { decision: DecisionResonancia } | null
): { accion: 'aceptar-con-pregunta' | 'avisar' | 'rechazar'; texto: string } {
  const { nivel, motivos } = analisis;
  const dec = resonancia?.decision ?? null;

  // Condiciones de rechazo: archivo peligroso por el Centinela o en cuarentena por resonancia
  if (nivel === 'peligroso' || dec === 'cuarentena') {
    const texto = motivos.length > 0 ? motivos.join(' ') : 'Archivo marcado como peligroso';
    return { accion: 'rechazar', texto };
  }

  // Condiciones de aviso: archivo sospechoso por el Centinela o aviso por resonancia
  if (nivel === 'sospechoso' || dec === 'aviso') {
    const texto = motivos.length > 0 ? motivos.join(' ') : 'Archivo marcado como sospechoso';
    return { accion: 'avisar', texto };
  }

  // Por defecto: preguntar al usuario (aceptar-con-pregunta)
  return { accion: 'aceptar-con-pregunta', texto: '' };
}