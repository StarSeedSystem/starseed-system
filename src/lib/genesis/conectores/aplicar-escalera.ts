import type { Candidato } from './escalera';
import type { RouteCandidate, RankCandidatesOptions } from '@/ai/astraura/router';
import type { PapelRuta } from '@/lib/mando/enrutamiento';

/**
 * Ordena candidatos por peldaño para usarlos como preferencia en rankCandidates.
 * Puro: solo reordena la lista, sin I/O.
 */
export function ordenarParaAstraura(candidatos: Candidato[]): Candidato[] {
  return [...candidatos].sort((a, b) => {
    if (a.peldano !== b.peldano) return a.peldano - b.peldano;
    return a.candidatoId.localeCompare(b.candidatoId);
  });
}

/**
 * Extrae el orden de ids para la cadena de un papel del enjambre.
 * Puro: ordena por peldaño y devuelve ids.
 */
export function ordenarParaEnjambre(candidatos: Candidato[], papel: PapelRuta): string[] {
  const ordenados = ordenarParaAstraura(candidatos);
  return ordenados.map(c => c.candidatoId);
}

/**
 * Opciones de ranking derivadas de la escalera.
 * De momento solo expone una señal de prioridad local sin modificar lógica.
 */
export function opcionesDesdeEscalera(candidatos: Candidato[]): RankCandidatesOptions {
  const tieneLocal = ordenarParaAstraura(candidatos).some(c => c.peldano === 1);
  return {
    personaAllowsPaid: null,
  };
}

/**
 * Obtiene el primer candidato del peldaño 1 si existe.
 */
export function primerLocal(candidatos: Candidato[]): Candidato | undefined {
  const ordenados = ordenarParaAstraura(candidatos);
  return ordenados.find(c => c.peldano === 1);
}

/**
 * Tipo de ayuda para el adaptador: solo declarativo.
 */
export type AdaptadorAstraura = {
  candidatos: Candidato[];
  orden: string[];
  opciones: RankCandidatesOptions;
};

