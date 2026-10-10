/**
 * Qué neuronas van atrasadas y POR QUÉ (contrato §5: «el panel de cada Genesis muestra qué
 * neuronas van atrasadas y por qué — pospuesta, en espera de Wi-Fi, falló»).
 *
 * Puro: sin React, sin red, sin `node:*`. Nunca lanza.
 */

import type { VersionesPorCapa } from "./capas";
import { CAPAS_ORDEN, NOMBRE_CAPA, compararVersiones, type CapaActualizacion } from "./manifiesto";
import type { MotivoEspera } from "./momento";

export interface EstadoNeuronaActualizacion {
  neuronaId: string;
  nombre: string;
  online: boolean;
  versiones: VersionesPorCapa;
  pospuestaPor?: MotivoEspera;
  fallo?: string;
  /** La persona tiene esa capa en «manual» y aún no la ha aplicado. */
  manual?: boolean;
}

export type MotivoAtraso = "fallo" | "offline" | "espera-wifi" | "pospuesta" | "manual" | "sin-dato" | "sin-motivo";

export interface Atraso {
  neuronaId: string;
  nombre: string;
  capa: CapaActualizacion;
  tiene: string | null;
  deberia: string;
  motivo: MotivoAtraso;
  texto: string;
}

const TEXTO_POSPUESTA: Record<MotivoEspera, string> = {
  llamada: "pospuesta por una llamada",
  directo: "pospuesta por un directo",
  escribiendo: "pospuesta mientras escribías",
  "bateria-baja": "pospuesta por batería baja",
  "espera-wifi": "esperando Wi-Fi",
};

function motivoDe(n: EstadoNeuronaActualizacion, tiene: string | null): { motivo: MotivoAtraso; porque: string } {
  if (n.fallo) return { motivo: "fallo", porque: `falló: ${n.fallo}` };
  if (!n.online) return { motivo: "offline", porque: "no está en línea" };
  if (n.pospuestaPor === "espera-wifi") return { motivo: "espera-wifi", porque: TEXTO_POSPUESTA["espera-wifi"] };
  if (n.pospuestaPor) return { motivo: "pospuesta", porque: TEXTO_POSPUESTA[n.pospuestaPor] };
  if (n.manual) return { motivo: "manual", porque: "en manual: espera a que la apliques" };
  if (!tiene) return { motivo: "sin-dato", porque: "no declara qué versión tiene" };
  return { motivo: "sin-motivo", porque: "sin motivo conocido" };
}

/** Una fila por neurona y capa por detrás de `ultima`. Orden estable: nombre y luego capa. */
export function neuronasAtrasadas(neuronas: readonly EstadoNeuronaActualizacion[], ultima: VersionesPorCapa): Atraso[] {
  const out: Atraso[] = [];
  for (const n of [...neuronas].sort((a, b) => a.nombre.localeCompare(b.nombre) || a.neuronaId.localeCompare(b.neuronaId))) {
    for (const capa of CAPAS_ORDEN) {
      const deberia = ultima[capa];
      if (!deberia) continue;
      const tiene = n.versiones[capa] ?? null;
      if (tiene && compararVersiones(tiene, deberia) >= 0) continue;
      const { motivo, porque } = motivoDe(n, tiene);
      out.push({
        neuronaId: n.neuronaId,
        nombre: n.nombre,
        capa,
        tiene,
        deberia,
        motivo,
        texto: `${n.nombre} va atrasada en ${NOMBRE_CAPA[capa].toLowerCase()} (${tiene ?? "?"} → ${deberia}): ${porque}.`,
      });
    }
  }
  return out;
}
