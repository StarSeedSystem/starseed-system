"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HERMIONE AUTOSYNC — orquestador de auto-instalación y sincronización (Adenda 74)
 * ---------------------------------------------------------------------------
 * Al iniciar sesión / cargar la app en un dispositivo, este módulo (SIN que el
 * usuario pulse nada):
 *   1. Registra ESTE dispositivo como neurona (`ensureThisNeuron`) — que ya
 *      marca su bridge Hermes — y comprueba si la cuenta tiene una neurona con
 *      Hermes en línea (o reciente).
 *   2. Si la hay, INSTALA automáticamente la personalidad Hermione
 *      (`ensureHermionePersonalityInstalled`, insert idempotente por owner/id).
 *   3. Asegura la carpeta de chats "Hermione".
 *   4. Arranca el WATCHER robusto del puente (salvaguarda anti-mudo + estado +
 *      cola + reflejo al cerebro).
 *
 * Coordinación entre pestañas: reutiliza la elección de líder existente
 * (`single-instance`). Las escrituras (fallback, carpeta, cerebro) se hacen solo
 * en la pestaña líder; el resto es idempotente. Per-pestaña: flag de una sola
 * ejecución. Defensivo y SSR-safe: nunca lanza; degrada a no-op sin sesión.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { ensureThisNeuron } from "@/lib/neurons/neurons";
import { ensureHermionePersonalityInstalled } from "@/lib/aurora/personalities";
import {
  ensureHermioneFolder,
  watchHermioneBridge,
  recomputeStatus,
  getHermioneStatus,
  onHermioneStatus,
  hermioneStatusLabel,
  pendingHermioneCount,
  HERMIONE_STATUS_EVENT,
  type HermioneBridgeStatus,
} from "@/lib/aurora/hermione-bridge";
import {
  startAuroraLeaderElection,
  isAuroraLeader,
} from "@/lib/aurora/single-instance";

const STARTED_FLAG = "__STARSEED_HERMIONE_AUTOSYNC__";
/** Ventana de "neurona reciente" para disparar la auto-instalación. */
const RECENT_MS = 5 * 60_000;

/**
 * ¿La cuenta tiene una neurona con Hermes en línea (o vista hace poco)?
 * Cuenta la neurona local (registrada por `ensureThisNeuron`), que marca
 * `capabilities.hermesInstalled` / `capabilities.bridge.mode`.
 */
async function hasRecentHermesNeuron(): Promise<boolean> {
  try {
    const sb = createClient();
    const { data } = await sb
      .from("neuron_devices")
      .select("capabilities, last_seen_at")
      .order("last_seen_at", { ascending: false })
      .limit(50);
    const now = Date.now();
    for (const row of ((data as Array<{ capabilities?: any; last_seen_at?: string }>) || [])) {
      const caps = row.capabilities || {};
      const bridge = caps.bridge;
      const hasHermes =
        (bridge && bridge.mode === "external-hermes") ||
        caps.hermesInstalled === true ||
        (Array.isArray(caps.servesPersonalities) &&
          (caps.servesPersonalities.includes("hermione") || caps.servesPersonalities.includes("Hermione")));
      if (!hasHermes) continue;
      if (caps.hermioneSync === false) continue;
      const seen = row.last_seen_at ? Date.parse(row.last_seen_at) : 0;
      if (now - seen < RECENT_MS) return true;
    }
    return false;
  } catch {
    return false;
  }
}

async function currentUserId(): Promise<string | null> {
  try {
    const sb = createClient();
    const { data } = await sb.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

let stopWatcher: (() => void) | null = null;

/** Boot de la sincronización para un usuario con sesión. Idempotente. */
async function bootForSession(): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;

  // 1) Registra este dispositivo como neurona (marca su bridge Hermes + latido).
  try { await ensureThisNeuron(); } catch { /* sin tabla/sesión: seguimos */ }

  // 2) ¿Hay una neurona con Hermes reciente? → auto-instala la personalidad.
  if (await hasRecentHermesNeuron()) {
    try { await ensureHermionePersonalityInstalled(); } catch { /* idempotente */ }
  }

  // 3) Carpeta "Hermione" (solo la líder crea; el resto la verá por realtime).
  if (isAuroraLeader()) {
    try { await ensureHermioneFolder(); } catch { /* */ }
  }

  // 4) Arranca (o reinicia) el watcher robusto del puente.
  try {
    stopWatcher?.();
    stopWatcher = watchHermioneBridge({ userId, leaderGate: isAuroraLeader });
  } catch { /* */ }

  void recomputeStatus();
}

/**
 * Arranca la auto-instalación + sincronización de Hermione. Idempotente por
 * pestaña. Llamar una vez al montar la app (p. ej. desde el provider de Aurora).
 */
export function startHermioneAutosync(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  if (w[STARTED_FLAG]) return;
  w[STARTED_FLAG] = true;

  // Asegura la elección de líder entre pestañas (idempotente).
  try { startAuroraLeaderElection(); } catch { /* */ }

  void bootForSession();

  // Re-boot al cambiar la sesión (login/logout en la misma pestaña).
  try {
    const sb = createClient();
    sb.auth.onAuthStateChange(() => { void bootForSession(); });
  } catch { /* */ }
}

/* ── Hook de estado para la UI (badge exportable) ──────────────────────────── */

export interface HermioneStatusView {
  status: HermioneBridgeStatus;
  label: string;
  pending: number;
}

/**
 * Estado del puente Hermione en vivo (en línea / sin neurona / reintentando /
 * inactiva) + nº de mensajes en cola. Usable en cualquier superficie.
 */
export function useHermioneStatus(): HermioneStatusView {
  const [view, setView] = useState<HermioneStatusView>(() => ({
    status: "inactivo",
    label: hermioneStatusLabel("inactivo"),
    pending: 0,
  }));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => {
      const status = getHermioneStatus();
      setView({ status, label: hermioneStatusLabel(status), pending: pendingHermioneCount() });
    };
    refresh();
    const off = onHermioneStatus(refresh);
    // Refresco suave del contador de cola (localStorage puede cambiar sin evento).
    const t = setInterval(refresh, 15_000);
    window.addEventListener(HERMIONE_STATUS_EVENT, refresh);
    return () => {
      off();
      clearInterval(t);
      window.removeEventListener(HERMIONE_STATUS_EVENT, refresh);
    };
  }, []);

  return view;
}
