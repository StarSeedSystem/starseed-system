/**
 * StarSeed OS — CAMR · ENLACES FÍSICOS (Ola 1005C · CAMR1005D).
 * ============================================================================
 * Fábricas de los tres adaptadores que implementan `EnlaceFisico` (§1 del
 * contrato CAMR): Meshtastic (envuelve `meshtastic-adapter.ts`), simulado
 * (envuelve `simulator.ts`) y agente (HTTP a `127.0.0.1:4480` con fetch
 * inyectable). Todo es puro; ninguna red ni hardware real se toca sin
 * `seco`.
 *
 * Regla de ley (§5): ninguna operación aplica parámetros fuera de
 * `dentroDeLey`.
 */

import type { EnlaceFisico, Tecnologia } from "./tipos";
import { AdaptadorMeshtastic } from "./adaptador-meshtastic";
import { AdaptadorSimulado } from "./adaptador-simulado";
import { AdaptadorAgente } from "./adaptador-agente";

export function crearAdaptadorMeshtastic(
  id: string,
  banda: string,
  frecuenciaMhz: number,
  capacidadKbps: number,
  mtu: number,
  cifradoPermitido: boolean,
): EnlaceFisico {
  const a = new AdaptadorMeshtastic({
    id,
    tecnologia: "meshtastic",
    banda,
    frecuenciaMhz,
    capacidadKbps,
    mtu,
    cifradoPermitido,
  });
  return a as EnlaceFisico;
}

export function crearAdaptadorSimulado(
  id: string,
  banda: string,
  frecuenciaMhz: number,
  capacidadKbps: number,
  mtu: number,
  cifradoPermitido: boolean,
): EnlaceFisico {
  const a = new AdaptadorSimulado({
    id,
    tecnologia: "simulado",
    banda,
    frecuenciaMhz,
    capacidadKbps,
    mtu,
    cifradoPermitido,
  });
  return a as EnlaceFisico;
}

export function crearAdaptadorAgente(
  id: string,
  banda: string,
  frecuenciaMhz: number,
  capacidadKbps: number,
  mtu: number,
  cifradoPermitido: boolean,
  fetchFn?: typeof fetch,
): EnlaceFisico {
  const a = new AdaptadorAgente({
    id,
    tecnologia: "rns", // el agente anuncia rns / 80211s / babel / batman / yggdrasil
    banda,
    frecuenciaMhz,
    capacidadKbps,
    mtu,
    cifradoPermitido,
    fetchFn,
  });
  return a as EnlaceFisico;
}
