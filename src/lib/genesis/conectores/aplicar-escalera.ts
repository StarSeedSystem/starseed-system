/**
 * GENESIS · ADAPTADOR PURA DE ESCALERA A ENRUTADOR (Ola 1019G · G)
 *
 * Convierte la salida de `elegirCandidatos` (escalera local primero,
 * 6 peldaños) al orden que entiende `rankCandidates` del enrutador
 * de Astraura (`RouteCandidate`) y a la cadena por papel del enjambre
 * (`PapelRuta` de `enrutamiento.ts`). Módulo PURO: sin red, disco ni
 * procesos lanzados; sin `any`; textos en español con acentos.
 */

import type { RouteCandidate, RankCandidatesOptions } from "@/ai/astraura/router";
import type { PapelRuta } from "@/lib/mando/enrutamiento";
import type { CatalogSource, CatalogModel } from "@/ai/astraura/free-catalog";
import type { Candidato } from "./escalera";

export interface EscaleraConvertida {
  candidatos: RouteCandidate[];
  papel: PapelRuta;
}

/**
 * Adaptador puro: convierte candidatos de la escalera al formato
 * del enrutador de Astraura (`RouteCandidate`), ordenados por
 * preferencia descendente (peldaño 1 primero). Los candidatos
 * prohibidos se descartan defensivamente.
 */
export function aplicarEscalera(
  candidatos: Candidato[],
  papel: PapelRuta,
  opciones?: RankCandidatesOptions,
  prohibidos: string[] = []
): EscaleraConvertida {
  // Filtra defensivamente los candidatos prohibidos y los sin peldano.
  const validos = candidatos.filter(
    (c) => c.peldano !== null && c.peldano !== undefined && !prohibidos.includes(c.candidatoId)
  );

  // Ordena por peldano ascendente (preferencia del enrutador: menor peldano = mayor prioridad).
  // El score se deriva inversamente del peldano para que `rankCandidates` los ordene correctamente.
  const ordenados = [...validos].sort((a, b) => {
    const pa = a.peldano ?? 99;
    const pb = b.peldano ?? 99;
    if (pa !== pb) return pa - pb;
    return a.candidatoId.localeCompare(b.candidatoId);
  });

  const candidatosRuta: RouteCandidate[] = ordenados.map((c) => {
    const peldano = c.peldano as number;
    // Score descendente según peldaño: 1 -> 6, 6 -> 1 (simulando prioridad del ranking).
    const score = Math.max(1, 7 - peldano);
    const motivo = c.motivo || `Peldaño ${peldano}`;

    const fuente: CatalogSource = {
      id: c.candidatoId,
      label: c.candidatoId,
      tier: "local",
      providerId: "starseed",
      baseUrl: "local://",
      requiresKey: false,
      limits: "N/A",
      why: motivo,
      privacy: "local",
      weight: 1.3 - peldano * 0.05,
      models: [],
    };

    const modelo: CatalogModel = {
      id: c.candidatoId,
      label: c.candidatoId,
      strengths: papel === "escritor" ? ["code", "chat"] : papel === "revisor" ? ["reasoning", "summary", "chat"] : ["chat", "reasoning"],
      quality: 5 + Math.max(0, 6 - peldano),
    };

    const candidatoRuta: RouteCandidate = {
      source: fuente,
      model: modelo,
      score,
      reason: motivo,
      fromUser: false,
    };

    return candidatoRuta;
  });

  // Si se proporcionan opciones de ranking, las aplicamos defensivamente.
  // En esta capa pura no se ejecutan filtros de pago ni capas de conciencia,
  // pero se respeta la estructura de `RankCandidatesOptions` para que el
  // enrutador pueda recibir este resultado sin regresión.
  if (opciones && opciones.personaAllowsPaid === false) {
    const filtradosPago = candidatosRuta.filter((r) => {
      // Defensivo: no descartamos candidatos locales por defecto.
      return r.source.tier !== "paid";
    });
    // Si el filtro de pago deja vacío, mantenemos los originales para no romper la cadena.
    return {
      candidatos: filtradosPago.length > 0 ? filtradosPago : candidatosRuta,
      papel,
    };
  }

  return { candidatos: candidatosRuta, papel };
}
