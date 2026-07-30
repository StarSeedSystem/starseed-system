"use client";

/**
 * StarSeed OS — BANDEJA DE RED (Adenda 102).
 * ============================================================================
 * Contenido RECIBIDO de otras neuronas por la red sináptica: se suscribe al
 * evento `starseed:mesh-inbound` que emite `deliverInbound` (tanto para el relé
 * privado como para el feed público) y mantiene una lista acotada y observable.
 *
 * Cierra el bucle publicar→almacenar→recibir de forma VISIBLE: cualquier
 * superficie (Señales, un feed de red, un aviso) puede leer lo que llega sin
 * acoplarse al transporte. SSR-safe. Nunca lanza.
 */

import { useSyncExternalStore } from "react";
import { boundAccountFor } from "./server-relay";

export const MESH_INBOUND_EVENT = "starseed:mesh-inbound";

export interface NetworkInboundItem {
  id: string;
  /** Tipo de payload (post, message, presence, alert, …). */
  type: string;
  cls: string;
  body: unknown;
  at: number;
  /** Firma pública verificada (Adenda 106). */
  verified?: boolean;
  /** Fingerprint de la identidad firmante (Adenda 107). */
  signerFp?: string;
  /** Cuenta ligada a esa identidad (verificada), si se conoce. */
  account?: string;
}

const MAX_ITEMS = 100;
let items: NetworkInboundItem[] = [];
const listeners = new Set<() => void>();
let wired = false;
let seq = 0;

function emit(): void {
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* */
    }
  }
}

function wire(): void {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener(MESH_INBOUND_EVENT, (e: Event) => {
    try {
      const d = (e as CustomEvent).detail as
        | { type?: string; cls?: string; body?: unknown; at?: number; verified?: boolean; signerFp?: string }
        | undefined;
      if (!d) return;
      const signerFp = typeof d.signerFp === "string" ? d.signerFp : undefined;
      const item: NetworkInboundItem = {
        id: `in-${++seq}-${d.at ?? 0}`,
        type: String(d.type ?? "message"),
        cls: String(d.cls ?? "P2"),
        body: d.body ?? null,
        at: typeof d.at === "number" ? d.at : 0,
        verified: d.verified === true,
        signerFp,
        account: boundAccountFor(signerFp) ?? undefined,
      };
      items = [item, ...items].slice(0, MAX_ITEMS);
      emit();
    } catch {
      /* */
    }
  });
}

/** Instantánea estable para useSyncExternalStore (no copiar). */
export function getNetworkInbox(): NetworkInboundItem[] {
  return items;
}

export function subscribeNetworkInbox(cb: () => void): () => void {
  wire();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function clearNetworkInbox(): void {
  items = [];
  emit();
}

/** Hook React: la bandeja de red recibida, reactiva. */
export function useNetworkInbox(): NetworkInboundItem[] {
  return useSyncExternalStore(subscribeNetworkInbox, getNetworkInbox, () => items);
}
