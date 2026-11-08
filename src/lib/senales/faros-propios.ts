/**
 * faros-propios — qué hacer con los faros del relé que son de TU cuenta antes de pintarlos en el radar
 * (NEU1108A · 2026-11-08). Contrato: architecture/sincronizacion-neuronas.md §9.3.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * Caso real (08-11): en la tableta, Señales › Radar enseñaba dos «Neurona de tu cuenta (anónima)» vía
 * «Relé StarSeed», «sin posición». Eran faros PROPIOS que `fusionarRadar` no supo casar con ninguna
 * neurona de la lista porque su id de neurona (`payload.nid`) era:
 *   · un id ABSORBIDO por una fusión (el de la neurona nueva que se fusionó en Maggaboard, o el de un
 *     medio que aún no adoptó el que se quedó) → se lleva a la que se quedó, y se funde con ella;
 *   · el de ESTA misma neurona anunciado desde otro medio u origen (la app vieja del origen publicado,
 *     cuyo faro sigue vivo hasta 30 min) → es «Tú», no otra neurona: fuera;
 *   · uno que no está en la lista y sin faro reciente → caducado: fuera.
 * Lo que quede y sea de tu cuenta lleva su nombre si se sabe (lista de la cuenta). Los faros de OTRAS
 * cuentas no se tocan: siguen anónimos como manda `cuentas.ts`.
 *
 * Puro: sin React, sin red. Nunca lanza.
 */

/** Lo mínimo de un faro (`RelayBeacon` / `BeaconView`). */
export interface FaroMin {
  deviceId: string;
  neuronId?: string;
  label: string | null;
  own: boolean;
  /** Epoch ms del anuncio. */
  at: number;
}

export interface ContextoFaros {
  /** Id de neurona de ESTE medio (vigente). */
  miNeurona: string | null;
  /** Las neuronas de la cuenta que ya pinta el radar (id → nombre). */
  neuronas: ReadonlyMap<string, string>;
  /** Alias de fusión: absorbida → la que se queda. */
  vigente?: (id: string) => string;
  ahora: number;
}

/**
 * Un faro propio sin neurona conocida solo cuenta si se renovó en su último ciclo: el faro se renueva cada
 * 20 min (`FAROS_CADA_MS` de synaptic.ts) y el relé lo guarda 30. Más de 21 min ⇒ ese medio ya no lo
 * renovó (se cerró, cambió de origen o de id): caducado.
 */
export const FARO_PROPIO_VIGENTE_MS = 21 * 60_000;

export type MotivoFaroFuera = "esta-neurona" | "caducado";

/**
 * Devuelve los faros que sí se pintan (con `neuronId` ya llevado a la neurona vigente y el nombre de las
 * propias que se sepa) y los que se quitan con su motivo. Pura.
 */
export function resolverFarosPropios<F extends FaroMin>(faros: readonly F[], ctx: ContextoFaros): { faros: F[]; fuera: Array<{ faro: F; motivo: MotivoFaroFuera }> } {
  const out: F[] = [];
  const fuera: Array<{ faro: F; motivo: MotivoFaroFuera }> = [];
  for (const f of faros ?? []) {
    if (!f || typeof f.deviceId !== "string") continue;
    if (!f.own) {
      out.push(f); // de otra cuenta: tal cual (anónima por diseño)
      continue;
    }
    let nid = typeof f.neuronId === "string" && f.neuronId ? f.neuronId : "";
    try {
      if (nid && ctx.vigente) nid = ctx.vigente(nid) || nid;
    } catch {
      /* sin alias */
    }
    if (nid && ctx.miNeurona && nid === ctx.miNeurona) {
      fuera.push({ faro: f, motivo: "esta-neurona" });
      continue;
    }
    const nombre = nid ? ctx.neuronas.get(nid) : undefined;
    if (nombre !== undefined) {
      // Neurona de la lista: `fusionarRadar` lo funde con su señal (y la reanima si el faro es reciente).
      out.push({ ...f, neuronId: nid, label: f.label || nombre || null });
      continue;
    }
    if (!(ctx.ahora - (f.at || 0) < FARO_PROPIO_VIGENTE_MS)) {
      fuera.push({ faro: f, motivo: "caducado" });
      continue;
    }
    out.push(nid ? { ...f, neuronId: nid } : f);
  }
  return { faros: out, fuera };
}
