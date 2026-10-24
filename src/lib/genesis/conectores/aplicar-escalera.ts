/**
 * Genesis · PUENTE CON EL ENRUTADOR DE ASTRAURA (Ola 1019G · tarea G)
 *
 * Adaptador PURO entre la escalera local-primero (src/lib/genesis/conectores/
 * escalera.ts) y el enrutador de Astraura (src/ai/astraura/router.ts). Convierte
 * la salida de `elegirCandidatos` en el orden de preferencia que entiende
 * `rankCandidates` (candidatos de tipo `RouteCandidate`, con el peldaño 1
 * encabezando la lista) y en la cadena por papel del enjambre (`PapelRuta`
 * de `src/lib/mando/enrutamiento.ts`).
 *
 * NUNCA toca la lógica del enrutador: solo importa sus TIPOS (`import type`,
 * borrados en runtime), así que no arrastra el «use client» ni los stores del
 * router. Sin red, sin disco, sin reloj: todo entra por parámetro.
 */

import type {
  RouteCandidate,
  RankCandidatesOptions,
} from "@/ai/astraura/router";
import type {
  CatalogSource,
  CatalogModel,
  SourceTier,
} from "@/ai/astraura/free-catalog";
import type { PapelRuta } from "@/lib/mando/enrutamiento";
import type { OpcionCatalogo, Papel } from "./catalogo-opciones";
import type { Tarea, Preferencias, Candidato } from "./escalera";

/** La escalera completa ya elegida, lista para tenderse sobre el enrutador. */
export interface EntradaEscalera {
  tarea: Tarea;
  candidatos: Candidato[];
  catalogo: OpcionCatalogo[];
  preferencias: Preferencias;
}

/** Resultado del puente: lo que el enrutador y la cadena por papel entienden. */
export interface PuenteEscalera {
  /** Candidatos en el ORDEN de la escalera (peldaño 1 primero, prohibidos fuera). */
  candidaturas: RouteCandidate[];
  /** Cadena por papel del enjambre a la que pertenece la tarea. */
  papelRuta: PapelRuta;
  /** Opciones del ranking derivadas del permiso de pago del ámbito. */
  opciones: RankCandidatesOptions;
}

/** Puntuación de la cabeza de la escalera: por encima de cualquier empujón. */
const NIVEL_BASE = 1_000;

/** Peldaño → puntuación descendente: el 1 manda y nadie del ranking lo adelanta. */
function puntuacionDe(peldano: Candidato["peldano"]): number {
  return NIVEL_BASE - (peldano - 1) * 10;
}

/**
 * Papel de la tarea → papel de la cadena del enjambre. Los que producen
 * código o texto escriben; quien revisa, revisa; el resto (chat, visión,
 * voz, imagen) se sirven como los directores, desde arriba.
 */
export function papelRutaDe(papel: Papel): PapelRuta {
  if (papel === "escritor" || papel === "código") return "escritor";
  if (papel === "revisor") return "revisor";
  return "director";
}

/** Peldaño → nivel del catálogo de Astraura, honesto según el medio. */
function tierDe(peldano: Candidato["peldano"]): SourceTier {
  if (peldano >= 6) return "paid";
  if (peldano === 5) return "free-key";
  if (peldano === 3) return "instant"; // bolsa de la malla
  return "local"; // peldaños 1, 2 y 4: la propia máquina o sus contenedores
}

/**
 * Convierte UN candidato de la escalera en la candidatura que el enrutador
 * entiende. La fuente sintética conserva el `id` de la opción (los ids del
 * catálogo unificado ya son los ids de las fuentes de Astraura), así que el
 * router la reconoce cuando corra el ranking de verdad.
 */
function convertir(src: Candidato, opcion: OpcionCatalogo): RouteCandidate {
  const tier = tierDe(src.peldano);
  const model: CatalogModel = {
    id: opcion.id,
    label: opcion.nombre,
    strengths: [],
    quality: 5,
  };
  const source: CatalogSource = {
    id: opcion.id,
    label: opcion.nombre,
    tier,
    providerId: "openai-compatible",
    baseUrl: "",
    requiresKey: opcion.requiereCuenta,
    models: [model],
    limits: opcion.gratis?.nota ?? "",
    why: src.motivo,
    privacy: tier === "local" ? "local" : "cloud",
    weight: 1,
  };
  return {
    source,
    model,
    score: puntuacionDe(src.peldano),
    reason: src.motivo,
    fromUser: src.peldano >= 5 && opcion.requiereCuenta,
  };
}

/**
 * Tiende la escalera sobre el enrutador: ordena los candidatos elegidos,
 * saca los prohibidos de cualquier peldaño y prepara las opciones del
 * ranking (el permiso de pago del ámbito) y la cadena por papel del enjambre.
 */
export function aplicarEscalera(entrada: EntradaEscalera): PuenteEscalera {
  const prohibidos = new Set(entrada.preferencias.prohibidos);
  const opcionesPorId = new Map(entrada.catalogo.map((o) => [o.id, o]));
  const candidaturas: RouteCandidate[] = [];

  const pedidos = [...entrada.candidatos].sort((a, b) => {
    if (a.peldano !== b.peldano) return a.peldano - b.peldano;
    return a.candidatoId.localeCompare(b.candidatoId);
  });

  for (const src of pedidos) {
    // Una prohibida no entra NUNCA: ni aunque su peldaño sea local (la escalera
    // solo filtra prohibidos en los peldaños 3, 5 y 6; aquí manda el ámbito).
    if (prohibidos.has(src.candidatoId)) continue;
    const opcion = opcionesPorId.get(src.candidatoId);
    if (!opcion) continue;
    candidaturas.push(convertir(src, opcion));
  }

  return {
    candidaturas,
    papelRuta: papelRutaDe(entrada.tarea.papel),
    opciones: { personaAllowsPaid: entrada.preferencias.permitirPago ? null : false },
  };
}
