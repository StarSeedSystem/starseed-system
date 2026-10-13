/**
 * centinela-archivos — Decisión de entrada de archivos basada en análisis y resonancia
 * (Ola 1012Q)
 */

import type { Nivel } from './centinela';
import type { DecisionResonancia, ResultadoResonancia } from './resonancias';

/**
 * Resultado del análisis de un archivo entrante
 */
export interface AnalisisEntrada {
  nivel: Nivel;
  motivos: string[];
}

/**
 * Decide la acción a tomar basada en el análisis del archivo y la resonancia de la red
 * 
 * @param analisis Resultado del análisis del archivo (nivel y motivos)
 * @param resonancia Resultado de la resonancia de la red (puede ser null si no hay datos)
 * @returns Objeto con la acción a tomar y el texto asociado
 */
export function decidirEntrada(
  analisis: AnalisisEntrada,
  resonancia: ResultadoResonancia | null
): { accion: 'aceptar-con-pregunta' | 'avisar' | 'rechazar'; texto: string } {
  // Caso de peligroso o cuarentena → rechazar
  if (
    analisis.nivel === 'peligroso' ||
    (resonancia?.decision === 'cuarentena')
  ) {
    const motivosAnalisis = analisis.motivos.length > 0 ? `Motivos: ${analisis.motivos.join('; ')}` : '';
    const motivoResonancia = resonancia?.decision === 'cuarentena' ? resonancia.motivo : '';
    
    let texto = 'Archivo rechazado por seguridad.';
    if (motivosAnalisis && motivoResonancia) {
      texto += ` ${motivosAnalisis}. ${motivoResonancia}`;
    } else if (motivosAnalisis) {
      texto += ` ${motivosAnalisis}`;
    } else if (motivoResonancia) {
      texto += ` ${motivoResonancia}`;
    }
    
    return { accion: 'rechazar', texto };
  }

  // Caso de sospechoso o aviso → avisar con los motivos
  if (
    analisis.nivel === 'sospechoso' ||
    resonancia?.decision === 'aviso'
  ) {
    const motivosAnalisis = analisis.motivos.length > 0 ? analisis.motivos.join('; ') : '';
    const motivoResonancia = resonancia?.decision === 'aviso' ? resonancia.motivo : '';
    
    let texto = 'Precaución: ';
    if (motivosAnalisis && motivoResonancia) {
      texto += `${motivosAnalisis}. ${motivoResonancia}`;
    } else if (motivosAnalisis) {
      texto += motivosAnalisis;
    } else if (motivoResonancia) {
      texto += motivoResonancia;
    }
    
    return { accion: 'avisar', texto };
  }

  // Si no, lo de siempre: preguntar
  return { accion: 'aceptar-con-pregunta', texto: '¿Aceptar este archivo?' };
}