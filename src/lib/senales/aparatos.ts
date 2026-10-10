/**
 * aparatos — tus aparatos, sus medios y el ENLACE real hacia ellos (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════
 * Reúne las fuentes en vivo (filas de la malla, presencia, enlaces directos sin internet) y las
 * cruza con la lista de señales para saber, de cada aparato de tu cuenta:
 *   · su estado (activa ahora / en segundo plano / solo latido / desconectada);
 *   · cómo llega hasta ti (P2P en red local, por internet, por TURN, directo sin internet, relé
 *     cifrado o ninguno) con su latencia;
 *   · qué medios tiene abiertos;
 *   · cuántas señales oye (radar compartido por la malla).
 * Los enlaces directos que no son ningún aparato del registro se devuelven como señales nuevas.
 *
 * Puro: sin React, sin red, sin `node:*`.
 */

import {
  ANTENNA_COLOR, ANTENNA_LABEL, placeBySector, qualityFromRtt, type DetectedSignal,
} from "@/ai/astraura/mesh/signals";
import { etiquetaRuta } from "@/lib/network/estadisticas-enlace";
import type { FotoEnlaceLocal } from "@/lib/malla/registro-enlaces-locales";
import type { PresenciaMedio } from "@/lib/neurons/presencia";
import { clasificarEnlace, ETIQUETA_CLASE, valorEnlace } from "./enlaces";
import { crearMedio } from "./medios";
import type { ContextoVivo, EnlaceMapa, EstadoAparato, MedioMapa, VivoMapa } from "./tipos-vivo";

export { fichaDeYo } from "./medios";

export const COLOR_ESTADO: Record<EstadoAparato, string> = {
  activa: "#34d399",
  "segundo-plano": "#fbbf24",
  "en-linea": "#94a3b8",
  desconectada: "#475569",
};

export const TEXTO_ESTADO: Record<EstadoAparato, string> = {
  activa: "activa ahora",
  "segundo-plano": "abierta en segundo plano",
  "en-linea": "en línea",
  desconectada: "desconectada",
};

/**
 * Subtítulo corto de un aparato: su estado y su enlace, sin repetir. Un aparato desconectado no
 * tiene enlace que contar («desconectada», no «desconectada · desconectada»).
 */
export function subtituloAparato(estado: EstadoAparato | null, enlace: EnlaceMapa): string {
  if (estado === "desconectada" && enlace.clase === "sin-enlace") return TEXTO_ESTADO.desconectada;
  const valor = valorEnlace(enlace, estado);
  return estado ? `${TEXTO_ESTADO[estado]} · ${valor}` : valor;
}

/**
 * Estado de un aparato. La presencia en vivo manda; sin ella solo hay latido (cada 5 min,
 * «en línea» = latido de los últimos minutos), y se dice así: nunca «activa ahora» sin verla.
 */
export function estadoAparato(medios: readonly PresenciaMedio[], enLineaPorLatido: boolean): EstadoAparato {
  if (medios.some((m) => m.visible)) return "activa";
  if (medios.length > 0) return "segundo-plano";
  return enLineaPorLatido ? "en-linea" : "desconectada";
}

function agrupar(medios: readonly PresenciaMedio[]): Map<string, PresenciaMedio[]> {
  const mapa = new Map<string, PresenciaMedio[]>();
  for (const m of medios) mapa.set(m.n, [...(mapa.get(m.n) ?? []), m]);
  return mapa;
}

/** Un enlace directo sin internet que no es ninguna fila de la cuenta, como señal del mapa. */
export function senalDeEnlaceLocal(e: FotoEnlaceLocal, miUid: string | null, ahora: number): DetectedSignal {
  const id = e.id.startsWith("local:") ? e.id : `local:${e.id}`;
  const quality = e.rttMs != null ? qualityFromRtt(e.rttMs) : null;
  const propia = !!e.uid && !!miUid && e.uid === miUid;
  return {
    id,
    antenna: "account",
    antennaLabel: ANTENNA_LABEL.account,
    signalType: "Aparato vinculado · enlace directo sin internet",
    label: e.nombre || "Aparato vinculado",
    detail: "Emparejado directamente contigo (sin internet). El canal vive en esta pestaña: si la cierras o cae la red local, desaparece.",
    quality,
    qualityDetail: quality == null
      ? "El canal aún no midió una ida y vuelta: sin latencia no hay calidad."
      : `Calidad calculada con la latencia REAL del canal directo: ${Math.round(e.rttMs!)} ms.`,
    metrics: [
      { label: "Latencia", value: e.rttMs == null ? "sin medir" : `${Math.round(e.rttMs)} ms` },
      ...(e.ruta ? [{ label: "Ruta", value: etiquetaRuta(e.ruta) }] : []),
      ...(e.capacidadKbps != null ? [{ label: "Capacidad de salida", value: `~${Math.round(e.capacidadKbps)} kbps` }] : []),
      ...(e.plataforma ? [{ label: "Plataforma", value: e.plataforma }] : []),
    ],
    compatible: true,
    compatDetail: "Habla el protocolo de la malla de StarSeed: tiene un canal abierto contigo ahora mismo.",
    starseed: {
      via: "direct-link", sourceId: e.id, name: e.nombre || null, ownAccount: propia, platform: e.plataforma,
      online: true, lastSeenMs: ahora, capabilities: [], syncDeviceId: e.syncDeviceId,
    },
    placement: placeBySector("account", id, quality),
    lastHeard: ahora,
    actions: [],
    simulated: false,
    color: ANTENNA_COLOR.account,
  };
}

/**
 * Cruza la lista de señales con las fuentes en vivo. `senales` es la lista ya detectada (con las
 * neuronas `neuron:<id>` de la cuenta); el resultado la complementa sin modificarla.
 */
export function construirVivo(senales: readonly DetectedSignal[], ctx: ContextoVivo): VivoMapa {
  const filas = new Map(ctx.filas.map((f) => [f.neuronId, f]));
  const porNeurona = agrupar(ctx.presencia.medios);
  const miNeuronaId = ctx.filas.find((f) => f.esEsteDispositivo)?.neuronId ?? null;
  const enlaces = new Map<string, EnlaceMapa>();
  const estados = new Map<string, EstadoAparato>();
  const oidas = new Map<string, number>();
  const medios: MedioMapa[] = [];
  const usados = new Set<string>();

  for (const s of senales) {
    if (s.id.startsWith("remoto:")) {
      const neurona = s.id.split(":")[1];
      if (neurona) oidas.set(`neuron:${neurona}`, (oidas.get(`neuron:${neurona}`) ?? 0) + 1);
    }
    if (!s.id.startsWith("neuron:")) continue;
    const neuronaId = s.starseed?.sourceId ?? s.id.slice("neuron:".length);
    const fila = filas.get(neuronaId) ?? null;
    const abiertos = porNeurona.get(neuronaId) ?? [];
    const sync = fila?.syncDeviceId ?? s.starseed?.syncDeviceId;
    const local = ctx.locales.find((l) => !!l.syncDeviceId && (l.syncDeviceId === sync || abiertos.some((m) => m.sid === l.syncDeviceId))) ?? null;
    if (local) usados.add(local.id);
    enlaces.set(s.id, clasificarEnlace(fila, {
      medios: abiertos, faroEnRele: s.metrics.some((m) => m.label === "Faro en el relé"), enlaceLocal: local, ahora: ctx.ahora,
    }));
    estados.set(s.id, estadoAparato(abiertos, !!(fila?.online ?? s.starseed?.online) || !!local));
    const conectado = fila?.enlace.estado === "conectado";
    for (const m of abiertos) {
      if (m.m === ctx.miMedioId) continue;
      medios.push(crearMedio(m, s.id, false, conectado && !!sync && m.sid === sync, ctx.ahora));
    }
  }
  // Otros medios abiertos en ESTE aparato (otra pestaña, la app nativa…): orbitan alrededor de «Tú».
  if (miNeuronaId) {
    for (const m of porNeurona.get(miNeuronaId) ?? []) {
      if (m.m !== ctx.miMedioId) medios.push(crearMedio(m, "yo", true, false, ctx.ahora));
    }
  }

  const extras: DetectedSignal[] = [];
  for (const l of ctx.locales) {
    if (usados.has(l.id)) continue;
    const e = senalDeEnlaceLocal(l, ctx.miUid, ctx.ahora);
    extras.push(e);
    enlaces.set(e.id, {
      clase: "directo-sin-internet", etiqueta: ETIQUETA_CLASE["directo-sin-internet"], latenciaMs: l.rttMs, ruta: null, claseRuta: l.ruta,
    });
    estados.set(e.id, "en-linea");
  }
  return { enlaces, estados, medios, extras, oidas, presenciaConectada: ctx.presencia.conectado };
}
