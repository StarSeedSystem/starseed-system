"use client";

import { safeGet, safeSet } from "@/lib/safe-storage";
import type { AjustesBanco, VentanaBanco } from "./tipos";

const AJUSTES_BANCO_LS_KEY = "starseed.malla.internet.banco.v1";
export const AJUSTES_BANCO_EVENT = "starseed:malla:internet:banco";

const AJUSTES_BANCO_POR_DEFECTO: AjustesBanco = {
  activo: false,
  modo: "diario",
  diarioMb: 100,
  ventanas: [],
};

function ventanaValida(v: unknown): VentanaBanco | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.desde !== "string" || typeof o.hasta !== "string" || typeof o.horaDesde !== "string" || typeof o.horaHasta !== "string" || typeof o.limiteMb !== "number") return null;
  return { desde: o.desde, hasta: o.hasta, horaDesde: o.horaDesde, horaHasta: o.horaHasta, limiteMb: o.limiteMb };
}

export function getAjustesBanco(): AjustesBanco {
  try {
    const raw = safeGet(AJUSTES_BANCO_LS_KEY);
    if (!raw) return { ...AJUSTES_BANCO_POR_DEFECTO };
    const j = JSON.parse(raw) as Partial<AjustesBanco>;
    const ventanas = Array.isArray(j.ventanas) ? j.ventanas.map(ventanaValida).filter((v): v is VentanaBanco => v !== null) : [];
    return {
      activo: typeof j.activo === "boolean" ? j.activo : AJUSTES_BANCO_POR_DEFECTO.activo,
      modo: j.modo === "diario" || j.modo === "programado" ? j.modo : AJUSTES_BANCO_POR_DEFECTO.modo,
      diarioMb: typeof j.diarioMb === "number" && Number.isFinite(j.diarioMb) ? Math.max(1, Math.round(j.diarioMb)) : AJUSTES_BANCO_POR_DEFECTO.diarioMb,
      ventanas,
    };
  } catch {
    return { ...AJUSTES_BANCO_POR_DEFECTO };
  }
}

export function setAjustesBanco(patch: Partial<AjustesBanco>): AjustesBanco {
  const prev = getAjustesBanco();
  const ventanas = patch.ventanas ?? prev.ventanas;
  const ventanasValidas = ventanas.map(ventanaValida).filter((v): v is VentanaBanco => v !== null);
  const next: AjustesBanco = {
    activo: typeof patch.activo === "boolean" ? patch.activo : prev.activo,
    modo: patch.modo === "diario" || patch.modo === "programado" ? patch.modo : prev.modo,
    diarioMb: typeof patch.diarioMb === "number" && Number.isFinite(patch.diarioMb) ? Math.max(1, Math.round(patch.diarioMb)) : prev.diarioMb,
    ventanas: ventanasValidas,
  };
  try {
    safeSet(AJUSTES_BANCO_LS_KEY, JSON.stringify(next));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(AJUSTES_BANCO_EVENT, { detail: next }));
    }
  } catch {
    /* no-op */
  }
  return next;
}

export function suscribirAjustesBanco(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(AJUSTES_BANCO_EVENT, cb);
  return () => window.removeEventListener(AJUSTES_BANCO_EVENT, cb);
}

export function calcularRestanteHoyMb(ajustes: AjustesBanco, usadoHoyMb: number): number | null {
  if (!ajustes.activo) return null;
  if (ajustes.modo === "diario") {
    return Math.max(0, ajustes.diarioMb - usadoHoyMb);
  }
  return null;
}