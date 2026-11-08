/**
 * conectores/registro — registro de conectores de medio (MED1108B · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `registrarConector()` es el punto por el que se enchufa hardware o firmware nuevo (Meshtastic por
 * serie nativo, RNode/Reticulum, routers OpenWrt, nodos base) sin tocar a quien los usa. Los siete
 * medios de hoy se registran con `instalarConectoresBase()` (ver `adaptadores.ts`).
 */

import type { EnlaceDisponible } from "@/lib/malla/eleccion-enlace";
import type { ConectorMedio, FichaCapacidades, ViaViva } from "./tipos";

const conectores = new Map<string, ConectorMedio>();
const oyentes = new Set<() => void>();

function avisar(): void {
  for (const cb of Array.from(oyentes)) {
    try {
      cb();
    } catch {
      /* un oyente roto no afecta a los demás */
    }
  }
}

/** Enchufa un conector. Si el id ya existe lo reemplaza. Devuelve la función que lo desenchufa. */
export function registrarConector(c: ConectorMedio): () => void {
  conectores.set(c.id, c);
  avisar();
  return () => {
    if (conectores.get(c.id) === c) {
      conectores.delete(c.id);
      avisar();
    }
  };
}

export function conectoresRegistrados(): ConectorMedio[] {
  return Array.from(conectores.values());
}

export function conectorPorId(id: string): ConectorMedio | undefined {
  return conectores.get(id);
}

/** Avisa cuando se enchufa o desenchufa un conector. */
export function alCambiarConectores(cb: () => void): () => void {
  oyentes.add(cb);
  return () => {
    oyentes.delete(cb);
  };
}

/**
 * Enlaces vivos de TODOS los conectores, cada uno con la ficha de su conector. Nunca lanza: un
 * conector que falla se salta (y queda como «sin enlaces»). Los ids repetidos se quedan con el primero.
 */
export async function descubrirVias(): Promise<ViaViva[]> {
  const out: ViaViva[] = [];
  const vistos = new Set<string>();
  for (const c of conectores.values()) {
    let enlaces: EnlaceDisponible[] = [];
    try {
      enlaces = await c.descubrir();
    } catch {
      enlaces = [];
    }
    for (const enlace of enlaces) {
      if (vistos.has(enlace.id)) continue;
      vistos.add(enlace.id);
      let ficha: FichaCapacidades;
      try {
        ficha = c.ficha(enlace);
      } catch {
        continue;
      }
      out.push({ conectorId: c.id, enlace, ficha });
    }
  }
  return out;
}

/** Solo para pruebas. */
export function __vaciarConectores(): void {
  conectores.clear();
  avisar();
}
