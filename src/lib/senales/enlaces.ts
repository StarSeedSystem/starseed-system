/**
 * enlaces — cómo llega de VERDAD cada elemento hasta ti, según lo medido (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Un aparato de tu cuenta puede llegar por un canal P2P (en tu red local, por internet atravesando
 * NAT o reenviado por TURN), por un enlace directo emparejado sin internet, solo por el relé
 * cifrado o por nada. Un nodo LoRa llega por el aire. La clase sale del estado del canal WebRTC y
 * de sus estadísticas ICE, jamás de una suposición; si no hay camino medido se dice el motivo.
 *
 * Puro: sin React, sin red, sin `node:*`.
 */

import { ANTENNA_COLOR, type DetectedSignal } from "@/ai/astraura/mesh/signals";
import type { DispositivoMallaRow } from "@/lib/network/malla-neuronas";
import type { RutaEnlace } from "@/lib/network/estadisticas-enlace";
import type { FotoEnlaceLocal } from "@/lib/malla/registro-enlaces-locales";
import type { PresenciaMedio } from "@/lib/neurons/presencia";
import { haceTexto } from "./fichas-base";
import type { ClaseEnlace, EnlaceMapa, EstadoAparato, VivoMapa } from "./tipos-vivo";

export const ETIQUETA_CLASE: Record<ClaseEnlace, string> = {
  "p2p-red-local": "P2P · misma red local",
  "p2p-internet": "P2P · internet directo",
  "p2p-turn": "P2P · reenviado por TURN",
  p2p: "P2P · ruta sin medir",
  "directo-sin-internet": "Directo · sin internet",
  rele: "Relé cifrado de la cuenta",
  "rf-lora": "Radio LoRa · oído por tu radio",
  "sin-enlace": "Sin enlace",
};

/** Cómo se dibuja cada clase de enlace: el trazo dice el tipo, nunca decora. */
export const ESTILO_ENLACE: Record<ClaseEnlace, { color: string; ancho: number; discontinua: boolean; opacidad: number }> = {
  "p2p-red-local": { color: "#2dd4bf", ancho: 2, discontinua: false, opacidad: 0.85 },
  "p2p-internet": { color: "#38bdf8", ancho: 1.8, discontinua: false, opacidad: 0.8 },
  "p2p-turn": { color: "#fbbf24", ancho: 1.6, discontinua: false, opacidad: 0.8 },
  p2p: { color: "#a78bfa", ancho: 1.6, discontinua: false, opacidad: 0.75 },
  "directo-sin-internet": { color: "#e879f9", ancho: 2, discontinua: false, opacidad: 0.85 },
  rele: { color: ANTENNA_COLOR.relay, ancho: 1.2, discontinua: true, opacidad: 0.55 },
  "rf-lora": { color: ANTENNA_COLOR.lora, ancho: 1, discontinua: true, opacidad: 0.4 },
  "sin-enlace": { color: "#94a3b8", ancho: 1, discontinua: true, opacidad: 0.3 },
};

const CORTA: Record<ClaseEnlace, string> = {
  "p2p-red-local": "red local",
  "p2p-internet": "internet",
  "p2p-turn": "TURN",
  p2p: "P2P",
  "directo-sin-internet": "sin internet",
  rele: "relé",
  "rf-lora": "LoRa",
  "sin-enlace": "",
};

function claseDeRuta(ruta: RutaEnlace | null | undefined): ClaseEnlace {
  switch (ruta?.clase) {
    case "misma-red-local": return "p2p-red-local";
    case "internet-directo": return "p2p-internet";
    case "reenviado-turn": return "p2p-turn";
    default: return "p2p";
  }
}

export interface ContextoEnlace {
  medios: readonly PresenciaMedio[];
  /** ¿Hay faro suyo en el relé (la señal de cuenta fusionada trae «Faro en el relé»)? */
  faroEnRele: boolean;
  enlaceLocal?: FotoEnlaceLocal | null;
  ahora: number;
}

/**
 * Cómo llega este aparato hasta ti, según lo MEDIDO. Prioridad: enlace directo sin internet →
 * canal P2P conectado (por su ruta ICE) → relé cifrado → sin enlace con su motivo.
 */
export function clasificarEnlace(fila: DispositivoMallaRow | null, ctx: ContextoEnlace): EnlaceMapa {
  const local = ctx.enlaceLocal;
  if (local) {
    return {
      clase: "directo-sin-internet", etiqueta: ETIQUETA_CLASE["directo-sin-internet"],
      latenciaMs: local.rttMs, ruta: null, claseRuta: local.ruta,
    };
  }
  const e = fila?.enlace;
  if (e?.estado === "conectado") {
    const clase = claseDeRuta(e.ruta);
    return { clase, etiqueta: ETIQUETA_CLASE[clase], latenciaMs: e.latenciaMs ?? e.ruta?.rttMs ?? null, ruta: e.ruta ?? null };
  }
  const sin = (motivo: string): EnlaceMapa => ({ clase: "sin-enlace", etiqueta: ETIQUETA_CLASE["sin-enlace"], latenciaMs: null, motivo });
  if (e?.estado === "conectando") return sin("conectando… el canal P2P se está negociando");
  if (e?.estado === "fallido") return sin(`el canal P2P falló: ${e.motivo?.trim() || "sin motivo informado"}`);
  if (ctx.faroEnRele) {
    return {
      clase: "rele", etiqueta: ETIQUETA_CLASE.rele, latenciaMs: null,
      motivo: "sin canal P2P, pero su faro está en el relé cifrado de tu cuenta (latencia no medida)",
    };
  }
  const enLinea = !!fila?.online || ctx.medios.length > 0;
  return sin(
    !enLinea
      ? `desconectada${fila?.ultimoVisto ? ` (último latido ${haceTexto(Date.parse(fila.ultimoVisto), ctx.ahora)})` : ""}`
      : "está en línea, pero todavía no hay canal P2P ni faro en el relé",
  );
}

/** Texto corto del valor clave de un enlace: «12 ms · red local». */
export function valorEnlace(enlace: EnlaceMapa, estado: EstadoAparato | null = null): string {
  if (enlace.clase === "sin-enlace") return estado === "desconectada" ? "desconectada" : "sin enlace";
  const lat = enlace.latenciaMs == null ? "latencia sin medir" : `${Math.round(enlace.latenciaMs)} ms`;
  return `${lat} · ${CORTA[enlace.clase]}`;
}

function metrica(s: DetectedSignal, etiqueta: string): string | null {
  return s.metrics.find((m) => m.label === etiqueta)?.value ?? null;
}

/**
 * El enlace de una señal hacia ti, o null si lo que se dibuja no es un enlace:
 *   · nodo LoRa que oye TU radio (no simulado, no «remoto:») → `rf-lora`, con su SNR/RSSI medidos;
 *   · aparatos (`neuron:` / `local:`) → lo que clasificó `construirVivo`;
 *   · todo lo demás (BLE, Wi-Fi ajeno, faros, serie…) no es un camino hasta ti → null.
 * Sin `vivo` (superficies ligeras), un `neuron:` con «Enlace P2P» conectado cae en `p2p` sin ruta.
 */
export function enlaceDeSenal(s: DetectedSignal, vivo: VivoMapa | null): EnlaceMapa | null {
  if (s.id.startsWith("remoto:")) return null;
  if (s.antenna === "lora") {
    if (s.simulated) return null;
    const snr = metrica(s, "SNR");
    const rssi = metrica(s, "RSSI");
    const detalle = [snr ? `SNR ${snr}` : null, rssi ? `RSSI ${rssi}` : null].filter(Boolean).join(" · ");
    return { clase: "rf-lora", etiqueta: ETIQUETA_CLASE["rf-lora"], latenciaMs: null, ...(detalle ? { detalle } : {}) };
  }
  if (s.id.startsWith("neuron:") || s.id.startsWith("local:")) {
    const v = vivo?.enlaces.get(s.id);
    if (v) return v;
    if (!vivo) {
      const p2p = metrica(s, "Enlace P2P");
      if (p2p && /^conectado/i.test(p2p)) {
        const ms = /(\d+)\s*ms/.exec(p2p);
        return { clase: "p2p", etiqueta: ETIQUETA_CLASE.p2p, latenciaMs: ms ? Number(ms[1]) : null };
      }
    }
  }
  return null;
}
