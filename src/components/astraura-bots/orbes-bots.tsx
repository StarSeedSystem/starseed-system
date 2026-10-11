/**
 * Orbes hermanas de los bots (BOT1011C1/C2 · contrato §3.3).
 * Conecta `orbes.ts` (puro) con la interfaz del OS: cada bot abierto es una
 * orbe hermana, posiciones por bot (`disposicionOrbes`), sin solaparse,
 * máximo 5 visibles (`MAX_ORBES_VISIBLES`), el resto en «más».
 */
import {
  MAX_ORBES_VISIBLES,
  disposicionOrbes,
  ordenZ,
  type EntradaOrbe,
  type PosOrbe,
  type VistaOrbes,
  type ResultadoOrbe,
} from "@/lib/astraura-bots/orbes";

export { MAX_ORBES_VISIBLES, disposicionOrbes, ordenZ };

export interface OrbesBotConfig {
  id: string;
  principal?: boolean;
  pos?: PosOrbe;
}

export function layoutOrbesBot(
  abiertos: readonly OrbesBotConfig[],
  vista: VistaOrbes,
): ResultadoOrbe[] {
  return disposicionOrbes(abiertos.map((o) => ({
    id: o.id,
    principal: o.principal,
    pos: o.pos,
  })), vista);
}
