/**
 * GENESIS · APLICADOR DE LA ESCALERA (Ola 1019G · Tarea G)
 * Adaptador PURO (sin red, sin disco, sin reloj) entre la escalera de Genesis
 * abierto (§2 de architecture/genesis-conectores-abiertos.md, salida de
 * `elegirCandidatos` en `./escalera.ts`) y sus dos consumidores ya existentes
 * NO tocados aquí: `rankCandidates` del enrutador de Astraura
 * (`src/ai/astraura/router.ts`) y la cadena por papel del enjambre
 * (`PapelRuta` en `src/lib/mando/enrutamiento.ts`). Solo traduce: los
 * `import type` se borran en runtime (nada contamina el paquete del cliente).
 */
import type { RouteCandidate, RankCandidatesOptions } from "@/ai/astraura/router";
import type { PapelRuta } from "@/lib/mando/enrutamiento";
import type { OpcionCatalogo, Papel } from "./catalogo-opciones";
import type { Candidato, Preferencias } from "./escalera";

/** Peldaño de la escalera según `elegirCandidatos` (1 = lo local más potente). */
export type Peldano = Candidato["peldano"];

/** Eslabón de la cadena por papel del enjambre, generado desde la escalera. */
export interface EslabonEscalera {
  id: string; // id de la opción del catálogo (el que casó el peldaño)
  nombre: string; // nombre legible de la opción
  peldano: Peldano; // peldaño de origen en la escalera de Genesis
  posicion: number; // posición en esta cadena, empezando por 1
  motivo: string; // motivo que dio la escalera (transparencia)
}

/** Ruta del router con su peldaño; `peldano: null` = no fue elegida (se descarta). */
export interface RutaPeldano {
  ruta: RouteCandidate;
  peldano: Peldano | null;
  motivo: string | null;
}

/** Papel de Genesis → papel de la cadena del enjambre («código» es el escritor del
 * enjambre; «chat» son los turnos generales hoy del papel «director»; visión, voz e
 * imagen todavía no forman ninguna cadena del enjambre: cadena vacía, honesta). */
export const PAPELES_POR_CADENA: Record<PapelRuta, readonly Papel[]> = {
  escritor: ["escritor", "código"],
  revisor: ["revisor"],
  director: ["chat"],
};

/**
 * Aplica la salida de `elegirCandidatos` sobre las rutas del router: casando
 * por `source.id` == `candidatoId`, marca cada ruta con su peldaño y deja
 * `peldano: null` (prohibida o no elegible) en la que no aparece. Pura.
 */
export function aplicarEscaleraConDetalle(
  rutas: readonly RouteCandidate[],
  elegidos: readonly Candidato[],
): RutaPeldano[] {
  const peldanos = new Map<string, Candidato>();
  for (const elegido of elegidos) peldanos.set(elegido.candidatoId, elegido);
  return rutas.map((ruta) => {
    const elegido = peldanos.get(ruta.source.id);
    return elegido
      ? { ruta, peldano: elegido.peldano, motivo: elegido.motivo }
      : { ruta, peldano: null, motivo: null };
  });
}

/**
 * El orden de preferencia que entiende `rankCandidates`: las rutas de las
 * opciones NO elegidas por la escalera (prohibidas, no vinculadas, sin permiso
 * de pago…) desaparecen, y las demás quedan por peldaño — el local del
 * peldaño 1 va PRIMERO sin importar la puntuación del router; en empate decide
 * esa puntuación. El `score` no cambia; el `reason` gana al final la elección
 * de la escalera (transparencia de la ruta).
 */
export function aplicarEscaleraAlRanking(
  rutas: readonly RouteCandidate[],
  elegidos: readonly Candidato[],
): RouteCandidate[] {
  return aplicarEscaleraConDetalle(rutas, elegidos)
    .filter((a): a is RutaPeldano & { peldano: Peldano; motivo: string } => a.peldano !== null)
    .sort((a, b) => a.peldano - b.peldano || b.ruta.score - a.ruta.score)
    .map((a) => ({
      ...a.ruta,
      reason: `${a.ruta.reason} · escalera de Genesis: ${a.motivo} (peldaño ${a.peldano})`,
    }));
}

/**
 * Preferencias del ámbito → opciones del ranking del router. Lo ÚNICO que la
 * escalera le pasa a `rankCandidates` es si se puede gastar: sin permiso de pago
 * o sin presupuesto vivos, `personaAllowsPaid: false` (restricción que solo
 * puede NEGAR, como la de la personalidad); lo demás queda para quien llama.
 */
export function opcionesRankDesdeEscalera(preferencias: Preferencias): RankCandidatesOptions {
  const presupuestoVivo = preferencias.topeDiario === null || preferencias.topeDiario > 0;
  return { personaAllowsPaid: preferencias.permitirPago && presupuestoVivo };
}

/**
 * La salida de la escalera en la CADENA por papel del enjambre: eslabones en
 * el orden del peldaño (local más potente primero, de pago solo al final y con
 * permiso), numerados desde 1. Los papeles de Genesis sin cadena del enjambre
 * quedan con la lista vacía.
 */
export function cadenaPorPapel(
  elegidos: readonly Candidato[],
  catalogo: readonly OpcionCatalogo[],
  papel: PapelRuta,
): EslabonEscalera[] {
  const papeles = new Set<Papel>(PAPELES_POR_CADENA[papel]);
  const conPapel = new Set(
    catalogo.filter((opcion) => opcion.papeles.some((rol) => papeles.has(rol))).map((opcion) => opcion.id),
  );
  return elegidos
    .filter((candidato) => conPapel.has(candidato.candidatoId))
    .sort((a, b) => a.peldano - b.peldano || a.candidatoId.localeCompare(b.candidatoId))
    .map((candidato, indice): EslabonEscalera => ({
      id: candidato.candidatoId,
      nombre: catalogo.find((op) => op.id === candidato.candidatoId)?.nombre ?? candidato.candidatoId,
      peldano: candidato.peldano,
      posicion: indice + 1,
      motivo: candidato.motivo,
    }));
}
