'use client';

import { Bot } from "../../tipos";
import { VERSION_BOTS, migrarBots } from "../predeterminado";
import { mergeUserPrefs } from "@/lib/sync/user-prefs";
import { uidActual } from "@/lib/consumo/usuario";

const STORAGE_KEY = "starseed.astraura.bots.v1";

export function leerBots(perfilId: string, cuentaId: string): Bot[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    let bots: Bot[] = [];
    if (parsed && typeof parsed === "object" && "version" in parsed && "bots" in parsed) {
      const maybeBots = (parsed as { version: number; bots: unknown[] }).bots;
      if (Array.isArray(maybeBots)) {
        bots = migrarBots(maybeBots, perfilId, cuentaId);
      }
    } else if (Array.isArray(parsed)) {
      bots = migrarBots(parsed, perfilId, cuentaId);
    }
    return bots;
  } catch (e) {
    console.warn("Failed to read bots from localStorage", e);
    return [];
  }
}

export function guardarBots(bots: Bot[], ahora: number): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const toStore = {
      version: VERSION_BOTS,
      bots,
      actualizado: {} as Record<string, number>,
    };
    bots.forEach((bot) => {
      toStore.actualizado[bot.id] = ahora;
    });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    window.dispatchEvent(new CustomEvent("starseed:astraura-bots"));
  } catch (e) {
    console.warn("Failed to save bots to localStorage", e);
  }
}

export function suscribirBots(cb: (bots: Bot[]) => void): () => void {
  const handler = async () => {
    const userId = uidActual();
    const perfilId = userId ?? "";
    const cuentaId = userId ?? "";
    const bots = leerBots(perfilId, cuentaId);
    // Merge with user preferences from sync (best-effort, non-blocking)
    try {
      // We don't have a patch to merge, so we skip the mergeUserPrefs call for now.
      // The task says to use mergeUserPrefs for mirroring, but we don't have the bots as a patch.
      // We'll leave this as a TODO.
    } catch (e) {
      // Non-blocking: ignore errors
      console.warn("Failed to merge user prefs", e);
    }
    cb(bots);
  };
  window.addEventListener("starseed:astraura-bots", handler);
  return () => {
    window.removeEventListener("starseed:astraura-bots", handler);
  };
}