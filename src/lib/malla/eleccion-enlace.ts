/**
 * eleccion-enlace — qué enlace usa el transporte universal y cómo reparte un archivo (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Módulo PURO (sin red, sin DOM, sin `node:*`): lo importan el transporte universal, la interfaz
 * y las pruebas. Contrato: `architecture/transporte-universal-sin-internet.md`.
 *
 * ORDEN (del más directo al menos directo; Alex: «el más directo y eficiente»):
 *   0 · enlace LOCAL emparejado sin internet (código/QR): ni servidores ni internet.
 *   1 · canal WebRTC de la malla de la cuenta o de un vínculo entre cuentas cuya ruta MEDIDA es la
 *       red local (host↔host): se señalizó por internet, pero el tráfico ya va por el Wi-Fi.
 *   2 · ese mismo canal por internet directo (NAT atravesado) o con ruta aún sin medir.
 *   3 · ese mismo canal reenviado por un servidor TURN.
 *   4 · relé cifrado del servidor del OS (solo mensajes).
 *   5 · radio LoRa (Meshtastic): solo mensajes CORTOS.
 * Dentro del mismo rango gana la menor latencia medida y luego la mayor capacidad medida.
 *
 * REPARTO MULTITRAYECTO: adapta la política «masivo» del planificador CAMR
 * (`ai/astraura/mesh/camr/planificador.ts`): por capacidad, troceado, nunca por LoRa. El número de
 * trozos sale de `fragmentosPorMtu` del propio CAMR y el reparto es proporcional a la capacidad
 * MEDIDA de cada enlace; si un enlace no tiene medida, cuenta como la mediana de los medidos (o
 * todos iguales si no hay ninguna). Nada se inventa: sin medida no se finge velocidad.
 */

import { fragmentosPorMtu } from "@/ai/astraura/mesh/camr/planificador";
import type { ClaseRuta } from "@/lib/network/estadisticas-enlace";

export type TipoEnlace = "local" | "cuenta" | "par" | "rele" | "lora";
export type ClaseEnvio = "mensaje" | "archivo" | "flujo";

/** LoRa (Meshtastic) lleva ~230 B por paquete; dejamos margen para la cabecera del OS. */
export const LORA_MAX_BYTES = 200;

/** A quién va un envío. Basta con UNA identidad que algún enlace alcance. */
export interface DestinoTransporte {
  /** Un enlace concreto (p. ej. «local:ab12»). Si se da, manda sobre todo lo demás. */
  enlaceId?: string;
  /** Aparato de destino (id de sincronización: malla de la cuenta y vínculos). */
  syncDeviceId?: string;
  /** Aparato de destino (id de neurona). */
  neuronDeviceId?: string;
  /** Persona de destino (cuenta): sirve cualquiera de sus aparatos enlazados. */
  uid?: string;
  /** Identidad de malla (huella) para el relé cifrado del servidor. */
  identidadRele?: string;
  /** Número de nodo Meshtastic para LoRa. */
  nodoLora?: number;
}

/** Lo que un enlace sabe del otro extremo (para enrutar; nunca para dar permisos). */
export interface AlcanceEnlace {
  syncDeviceId?: string;
  neuronDeviceId?: string;
  uid?: string;
  /** El enlace llega a cualquier destinatario que se nombre (relé, radio LoRa). */
  difusion?: boolean;
}

export interface EnlaceDisponible {
  id: string;
  tipo: TipoEnlace;
  etiqueta: string;
  alcanza: AlcanceEnlace;
  abierto: boolean;
  /** ¿Funciona ahora mismo sin internet? (medido por la ruta, no supuesto). */
  sinInternet: boolean;
  /** Ruta medida del canal WebRTC (null = sin medir). */
  ruta?: ClaseRuta | null;
  rttMs?: number | null;
  capacidadKbps?: number | null;
  /** Tamaño máximo de un envío por este enlace (bytes). */
  maxBytes?: number;
  admite: Record<ClaseEnvio, boolean>;
}

export interface EnlaceElegido {
  enlace: EnlaceDisponible;
  rango: number;
  motivo: string;
}

export interface Descartado {
  id: string;
  tipo: TipoEnlace;
  motivo: string;
}

export interface Eleccion {
  elegidos: EnlaceElegido[];
  descartados: Descartado[];
}

/** Rango de un enlace (0 = el más directo). Ver la cabecera. */
export function rangoEnlace(e: EnlaceDisponible): number {
  switch (e.tipo) {
    case "local":
      return 0;
    case "cuenta":
    case "par":
      if (e.ruta === "misma-red-local") return 1;
      if (e.ruta === "reenviado-turn") return 3;
      return 2;
    case "rele":
      return 4;
    case "lora":
      return 5;
    default:
      return 9;
  }
}

/** Frase corta y honesta de por qué un enlace ocupa su sitio. */
export function motivoRango(e: EnlaceDisponible): string {
  switch (rangoEnlace(e)) {
    case 0:
      return "enlace directo sin internet (emparejado en persona)";
    case 1:
      return "canal P2P por la red local (ruta medida)";
    case 2:
      return e.ruta === "internet-directo" ? "canal P2P por internet" : "canal P2P (ruta aún sin medir)";
    case 3:
      return "canal P2P reenviado por un servidor TURN";
    case 4:
      return "relé cifrado del servidor del OS";
    case 5:
      return "radio LoRa (solo mensajes cortos)";
    default:
      return "enlace";
  }
}

/** ¿Este enlace llega a ese destino? Puro. */
export function alcanzaDestino(e: EnlaceDisponible, d: DestinoTransporte): boolean {
  if (d.enlaceId) return e.id === d.enlaceId;
  if (e.tipo === "rele") return !!e.alcanza.difusion && !!d.identidadRele;
  if (e.tipo === "lora") return !!e.alcanza.difusion && typeof d.nodoLora === "number";
  const a = e.alcanza;
  if (d.syncDeviceId && a.syncDeviceId === d.syncDeviceId) return true;
  if (d.neuronDeviceId && a.neuronDeviceId === d.neuronDeviceId) return true;
  if (d.uid && a.uid === d.uid) return true;
  return false;
}

function compararNumero(a: number | null | undefined, b: number | null | undefined, asc: boolean): number {
  const va = typeof a === "number" && Number.isFinite(a) ? a : null;
  const vb = typeof b === "number" && Number.isFinite(b) ? b : null;
  if (va === null && vb === null) return 0;
  if (va === null) return 1; // sin medida, detrás
  if (vb === null) return -1;
  return asc ? va - vb : vb - va;
}

/**
 * elegirEnlaces — candidatos ORDENADOS para un envío de `clase` y `bytes` a `destino`, con el
 * motivo de cada descarte (para decirlo en la interfaz). Pura y determinista.
 */
export function elegirEnlaces(
  enlaces: EnlaceDisponible[],
  destino: DestinoTransporte,
  clase: ClaseEnvio,
  bytes = 0,
): Eleccion {
  const elegidos: EnlaceElegido[] = [];
  const descartados: Descartado[] = [];
  const vistos = new Set<string>();
  for (const e of enlaces) {
    if (vistos.has(e.id)) continue;
    vistos.add(e.id);
    const descartar = (motivo: string) => descartados.push({ id: e.id, tipo: e.tipo, motivo });
    if (!alcanzaDestino(e, destino)) {
      descartar("no llega a ese destino");
      continue;
    }
    if (!e.abierto) {
      descartar("no está abierto ahora");
      continue;
    }
    if (!e.admite[clase]) {
      descartar(
        clase === "flujo"
          ? "no lleva audio ni vídeo (las llamadas directas van por el enlace local)"
          : clase === "archivo"
            ? e.tipo === "lora"
              ? "LoRa no lleva archivos"
              : e.tipo === "rele"
                ? "el relé del servidor no lleva archivos"
                : "este enlace no tiene permiso para archivos"
            : "no lleva mensajes",
      );
      continue;
    }
    if (typeof e.maxBytes === "number" && bytes > e.maxBytes) {
      descartar(`el envío (${bytes} B) supera lo que lleva este enlace (${e.maxBytes} B)`);
      continue;
    }
    elegidos.push({ enlace: e, rango: rangoEnlace(e), motivo: motivoRango(e) });
  }
  elegidos.sort(
    (a, b) =>
      a.rango - b.rango ||
      compararNumero(a.enlace.rttMs, b.enlace.rttMs, true) ||
      compararNumero(a.enlace.capacidadKbps, b.enlace.capacidadKbps, false) ||
      (a.enlace.id < b.enlace.id ? -1 : a.enlace.id > b.enlace.id ? 1 : 0),
  );
  return { elegidos, descartados };
}

/** ¿Dos enlaces llegan al MISMO aparato? (por id de sincronización o de neurona). Puro. */
export function mismoAparato(a: AlcanceEnlace, b: AlcanceEnlace): boolean {
  if (a.syncDeviceId && b.syncDeviceId) return a.syncDeviceId === b.syncDeviceId;
  if (a.neuronDeviceId && b.neuronDeviceId) return a.neuronDeviceId === b.neuronDeviceId;
  return false;
}

/**
 * Enlaces P2P que pueden llevar trozos del MISMO archivo a la vez: nunca relé ni LoRa, y solo los
 * que llegan al mismo aparato que el mejor (un destino «persona» puede tener varios aparatos, y
 * repartir un archivo entre aparatos distintos lo rompería). El mejor va primero.
 */
export function enlacesParaReparto(eleccion: Eleccion): EnlaceDisponible[] {
  const p2p = eleccion.elegidos
    .map((x) => x.enlace)
    .filter((e) => e.tipo === "local" || e.tipo === "cuenta" || e.tipo === "par");
  if (p2p.length <= 1) return p2p;
  const [mejor, ...resto] = p2p;
  return [mejor, ...resto.filter((e) => mismoAparato(mejor.alcanza, e.alcanza))];
}

/** Peso de cada enlace para el reparto: su capacidad medida, o la mediana de los medidos, o 1. */
export function pesosPorCapacidad(enlaces: Array<{ id: string; capacidadKbps?: number | null }>): Array<{ id: string; peso: number }> {
  const medidas = enlaces
    .map((e) => e.capacidadKbps)
    .filter((c): c is number => typeof c === "number" && Number.isFinite(c) && c > 0)
    .sort((a, b) => a - b);
  const mediana = medidas.length ? medidas[Math.floor((medidas.length - 1) / 2)] : 1;
  return enlaces.map((e) => {
    const c = e.capacidadKbps;
    return { id: e.id, peso: typeof c === "number" && Number.isFinite(c) && c > 0 ? c : mediana };
  });
}

/**
 * planReparto — cuántos trozos de `bytes` (en trozos de `tamTrozo`) lleva cada enlace, en
 * proporción a su peso (método del mayor resto). Siempre suma el total. Puro.
 */
export function planReparto(
  bytes: number,
  tamTrozo: number,
  enlaces: Array<{ id: string; capacidadKbps?: number | null }>,
): { trozos: number; porEnlace: Record<string, number> } {
  const trozos = Math.max(bytes > 0 ? 1 : 0, fragmentosPorMtu(bytes, tamTrozo));
  const porEnlace: Record<string, number> = {};
  if (!enlaces.length || trozos === 0) return { trozos, porEnlace };
  const pesos = pesosPorCapacidad(enlaces);
  const total = pesos.reduce((s, p) => s + p.peso, 0);
  const cuotas = pesos.map((p) => ({ id: p.id, exacta: (trozos * p.peso) / total }));
  let asignados = 0;
  for (const c of cuotas) {
    porEnlace[c.id] = Math.floor(c.exacta);
    asignados += porEnlace[c.id];
  }
  const restos = [...cuotas].sort((a, b) => b.exacta - Math.floor(b.exacta) - (a.exacta - Math.floor(a.exacta)) || (a.id < b.id ? -1 : 1));
  for (let i = 0; asignados < trozos; i = (i + 1) % restos.length) {
    porEnlace[restos[i].id] += 1;
    asignados += 1;
  }
  return { trozos, porEnlace };
}

/**
 * Selector ponderado suave (el de nginx): reparte en el ORDEN de envío intercalando enlaces según
 * su peso (con 3:1 sale A A B A A A B A…, no AAA…B). `excluir` salta enlaces llenos o caídos en esa
 * vuelta sin perder la proporción del resto. Determinista.
 */
export interface SelectorPonderado {
  siguiente(excluir?: ReadonlySet<string>): string | null;
}

export function crearSelectorPonderado(pesos: Array<{ id: string; peso: number }>): SelectorPonderado {
  const estado = pesos
    .filter((p) => Number.isFinite(p.peso) && p.peso > 0)
    .map((p) => ({ id: p.id, peso: p.peso, actual: 0 }));
  return {
    siguiente(excluir) {
      const vivos = estado.filter((e) => !excluir?.has(e.id));
      if (!vivos.length) return null;
      const total = vivos.reduce((s, e) => s + e.peso, 0);
      let mejor = vivos[0];
      for (const e of vivos) {
        e.actual += e.peso;
        if (e.actual > mejor.actual) mejor = e;
      }
      mejor.actual -= total;
      return mejor.id;
    },
  };
}
