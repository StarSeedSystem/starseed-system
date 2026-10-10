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
import { ensureThisNeuron, listNeurons } from "@/lib/neurons/neurons";
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
  // (CON1010 · 2026-10-10) Sobre la lista COMPARTIDA del registro de neuronas, no con una consulta
  // propia de 50 filas en cada evento de sesión (245 el 10-10, una por vuelta a la pestaña).
  try {
    const neuronas = await listNeurons();
    const now = Date.now();
    for (const n of neuronas) {
      const caps = (n.capabilities || {}) as any;
      const bridge = caps.bridge;
      const hasHermes =
        (bridge && bridge.mode === "external-hermes") ||
        caps.hermesInstalled === true ||
        (Array.isArray(caps.servesPersonalities) &&
          (caps.servesPersonalities.includes("hermione") || caps.servesPersonalities.includes("Hermione")));
      if (!hasHermes) continue;
      if (caps.hermioneSync === false) continue;
      const seen = n.last_seen_at ? Date.parse(n.last_seen_at) : 0;
      if (n.online || now - seen < RECENT_MS) return true;
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

  // Arranque y re-arranque al cambiar la sesión (login/logout en la misma pestaña). El primer
  // evento (INITIAL_SESSION) hace el arranque inicial: llamarlo además aquí lo duplicaba.
  // (CON1010) Solo cuando cambia la cuenta: la renovación del token y el eco de volver a la
  // pestaña relanzaban el arranque entero (neurona, Hermione, carpeta, vigilante).
  try {
    const sb = createClient();
    let cuenta: string | null | undefined;
    sb.auth.onAuthStateChange((_ev, sesion) => {
      const uid = sesion?.user?.id ?? null;
      if (uid === cuenta) return;
      cuenta = uid;
      void bootForSession();
    });
  } catch {
    void bootForSession();
  }
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
