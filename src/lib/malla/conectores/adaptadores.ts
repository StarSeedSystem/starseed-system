/**
 * conectores/adaptadores — envuelve los siete medios que ya existen con `ConectorMedio` (MED1108B · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * NO cambian el comportamiento del transporte: `descubrir()` solo LEE `enlacesDisponibles()` (que ya
 * junta los registros vivos de enlaces locales, red local nativa, Bluetooth, malla de la cuenta,
 * vínculos entre cuentas, relé y radio) y filtra por tipo. El Wi‑Fi directo viaja por el canal TCP
 * 47071, así que lo recoge el conector «nativo». Los envíos reales siguen siendo del transporte
 * universal; aquí solo `local` envía/recibe/cierra por su registro, que es de lectura/uso directo.
 */

import type { EnlaceDisponible, TipoEnlace } from "@/lib/malla/eleccion-enlace";
import { enlaceLocal } from "@/lib/malla/registro-enlaces-locales";
import { fichaDeTipo } from "./fichas";
import { registrarConector } from "./registro";
import type { ConectorMedio } from "./tipos";

export interface DepsAdaptador {
  /** Fuente de enlaces vivos (por defecto `enlacesDisponibles()` del transporte universal). */
  fuente?: () => Promise<EnlaceDisponible[]>;
}

const ETIQUETAS: Record<TipoEnlace, string> = {
  local: "WebRTC local (sin internet)",
  nativo: "Red local de la app nativa (TCP 47071 · Wi‑Fi directo)",
  ble: "Bluetooth directo",
  cuenta: "Malla de la cuenta (WebRTC)",
  par: "Vínculo entre cuentas (WebRTC)",
  rele: "Relé cifrado del servidor",
  lora: "Radio LoRa (Meshtastic)",
};

export const TIPOS_BASE: TipoEnlace[] = ["local", "nativo", "ble", "cuenta", "par", "rele", "lora"];

let memo: { t: number; p: Promise<EnlaceDisponible[]> } | null = null;

/** Lectura compartida y breve (1 s) para que los siete conectores no repitan el sondeo. */
async function fuenteGlobal(): Promise<EnlaceDisponible[]> {
  const ahora = Date.now();
  if (memo && ahora - memo.t < 1000) return memo.p;
  const p = import("@/lib/malla/transporte-universal").then((m) => m.enlacesDisponibles());
  memo = { t: ahora, p };
  try {
    return await p;
  } catch {
    memo = null;
    return [];
  }
}

export function crearConectorBase(tipo: TipoEnlace, deps: DepsAdaptador = {}): ConectorMedio {
  const fuente = deps.fuente ?? fuenteGlobal;
  return {
    id: tipo,
    tipo,
    etiqueta: ETIQUETAS[tipo],
    async descubrir() {
      try {
        return (await fuente()).filter((e) => e.tipo === tipo);
      } catch {
        return [];
      }
    },
    async enlazar(destino) {
      // El emparejado lo hacen las pantallas de «Vincular» y el transporte; aquí solo se comprueba.
      try {
        return (await fuente()).some((e) => e.tipo === tipo && e.abierto && (e.id === destino || e.alcanza.syncDeviceId === destino || e.alcanza.neuronDeviceId === destino));
      } catch {
        return false;
      }
    },
    async enviar(enlaceId, datos) {
      if (tipo !== "local") return false; // el resto lo envía el transporte universal
      const e = enlaceLocal(enlaceId);
      if (!e) return false;
      try {
        return typeof datos === "string" ? e.enviar(datos) : e.enviarBinario(datos);
      } catch {
        return false;
      }
    },
    alRecibir(cb) {
      if (tipo !== "local") return () => {};
      // Los enlaces locales nacen y mueren; se engancha a los que ya están abiertos al pedirlo.
      const bajas: Array<() => void> = [];
      void fuente().then((es) => {
        for (const e of es) {
          if (e.tipo !== "local") continue;
          const v = enlaceLocal(e.id);
          if (v) bajas.push(v.alMensaje((d) => cb(e.id, d)));
        }
      }).catch(() => {});
      return () => bajas.forEach((b) => b());
    },
    cerrar(enlaceId) {
      if (tipo !== "local") return;
      try {
        if (enlaceId) enlaceLocal(enlaceId)?.cerrar();
      } catch {
        /* ya cerrado */
      }
    },
    ficha: (enlace) => fichaDeTipo(tipo, enlace),
  };
}

/** Registra los siete conectores de hoy. Idempotente. Devuelve la función que los quita. */
export function instalarConectoresBase(deps: DepsAdaptador = {}): () => void {
  const bajas = TIPOS_BASE.map((t) => registrarConector(crearConectorBase(t, deps)));
  return () => bajas.forEach((b) => b());
}
