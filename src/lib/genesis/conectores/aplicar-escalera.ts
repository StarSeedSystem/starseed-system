/**
 * GENESIS · APLICAR ESCALERA (Ola 1019G)
 * 
 * Adaptador PURO: convierte la salida de `elegirCandidatos` en el orden de
 * preferencia que entiende `rankCandidates` de `src/ai/astraura/router.ts`
 * (importa sus tipos `RouteCandidate`, `RankCandidatesOptions`) y en la
 * cadena por papel del enjambre (`PapelRuta` de `src/lib/mando/enrutamiento.ts`).
 * 
 * No modifica esos archivos.
 */

import type { RouteCandidate, RankCandidatesOptions } from '@/ai/astraura/router';
import type { PapelRuta } from '@/lib/mando/enrutamiento';
import type { OpcionCatalogo, Candidato, Tarea, OfertaContexto, Preferencias } from './escalera';
import { elegirCandidatos } from './escalera';
import type { CatalogSource } from '@/ai/astraura/free-catalog';

/** Resultado de aplicar la escalera: candidatos listos para `rankCandidates` y opciones por papel. */
export interface EscaleraAplicada {
  candidatos: RouteCandidate[];
  opcionesPorPapel: Record<PapelRuta, RankCandidatesOptions>;
}

/** IDs de fuentes 1.58 para detectar prioridad local. */
const SOURCES_158 = new Set(['astraura-158-local', 'astraura-158-malla', 'astraura-158-nube']);

/** Convierte un Candidato a RouteCandidate buscando en el catálogo de Astraura. */
function aRouteCandidate(cand: Candidato, catalogoAstraura: CatalogSource[], _tarea: Tarea): RouteCandidate | null {
  const source = catalogoAstraura.find((s) => s.id === cand.candidatoId);
  if (!source || !source.models[0]) return null;

  const fromUser = source.requiresKey && source.tier !== 'local' && source.tier !== 'instant';
  const local158Priority = SOURCES_158.has(source.id);
  const scoreBase = 100 - (cand.peldano - 1) * 15;

  return { source, model: source.models[0], score: scoreBase, reason: cand.motivo, fromUser, local158Priority };
}

/** Aplica la escalera y convierte el resultado para `rankCandidates`. */
export function aplicarEscalera(params: {
  tarea: Tarea;
  ofertas: OfertaContexto[];
  catalogo: OpcionCatalogo[];
  vinculadas: Set<string>;
  preferencias: Preferencias;
  catalogoAstraura: CatalogSource[];
  papelActual: PapelRuta;
  opcionesBase?: RankCandidatesOptions;
}): EscaleraAplicada {
  const candidatosEscalera = elegirCandidatos({
    tarea: params.tarea,
    ofertas: params.ofertas,
    catalogo: params.catalogo,
    vinculadas: params.vinculadas,
    preferencias: params.preferencias,
  });

  const candidatos = candidatosEscalera
    .map((c) => aRouteCandidate(c, params.catalogoAstraura, params.tarea))
    .filter((c): c is RouteCandidate => c !== null);

  const papeles: PapelRuta[] = ['escritor', 'revisor', 'director'];
  const opcionesPorPapel: Record<PapelRuta, RankCandidatesOptions> = {
    escritor: {}, revisor: {}, director: {},
  };
  for (const papel of papeles) {
    opcionesPorPapel[papel] = { ...params.opcionesBase };
  }

  return { candidatos, opcionesPorPapel };
}

export type { Candidato, Tarea, OfertaContexto, Preferencias, OpcionCatalogo };