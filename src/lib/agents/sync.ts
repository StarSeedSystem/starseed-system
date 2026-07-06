"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — Agentes · SINCRONIZACIÓN con la cuenta soberana
 * ---------------------------------------------------------------------------
 * Lleva los AGENTES, sus VÍNCULOS (bindings) y el registro público "stub" a la
 * cuenta soberana compartida por el ecosistema (Supabase `dzkjapinnewkxzjltadv`,
 * tabla `user_settings`, jsonb `prefs`), siguiendo EXACTAMENTE el patrón de
 * `src/lib/library-sync.ts`:
 *   · LOCAL ES LA VERDAD (localStorage manda sin conexión).
 *   · MERGE NO DESTRUCTIVO de `prefs`: se lee y se mezclan SOLO nuestras claves.
 *   · UNIÓN, nunca resta, al traer de la cuenta (mergeAgentsFromAccount).
 *   · Escucha el MISMO evento `starseed:library` para el push con debounce.
 *
 * Claves añadidas al jsonb `prefs`:
 *   prefs.agents        → Agent[]              (getAgentsSnapshot().agents)
 *   prefs.agentBindings → AgentBinding[]       (getAgentsSnapshot().bindings)
 *   prefs.agentsPublic  → PublicAgentRecord[]  (getAgentsSnapshot().publicAgents)
 *
 * MONTAJE: `useAgentsSync()` está pensado para montarse UNA vez junto a
 * `useLibrarySync()` (p.ej. en el mismo SovereignSyncMount del RootLayout).
 * Todo defensivo y SSR-safe: sin sesión/tabla/red no rompe nada.
 *
 * (Alternativa mínima para el padre: añadir a library-sync.pushSnapshot las 3
 *  líneas `prefs.agents/…/… = getAgentsSnapshot()` y a pullAndMerge una llamada
 *  a `mergeAgentsFromAccount`. Este módulo evita tocar ese archivo.)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { getAgentsSnapshot, mergeAgentsFromAccount } from "./store";

const LIBRARY_EVENT = "starseed:library";
const PUSH_DEBOUNCE_MS = 1000;

function isClient(): boolean {
  return typeof window !== "undefined";
}

async function getUserId(): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Trae agentes/bindings/públicos de la cuenta y los FUSIONA con lo local. */
async function pullAndMerge(userId: string): Promise<void> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("user_settings")
      .select("prefs")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data?.prefs || typeof data.prefs !== "object") return;
    const prefs = data.prefs as Record<string, unknown>;
    mergeAgentsFromAccount({
      agents: prefs.agents,
      bindings: prefs.agentBindings,
      publicAgents: prefs.agentsPublic,
    });
  } catch {
    /* sin sesión / sin tabla / red: localStorage manda */
  }
}

/** Sube el snapshot de agentes a la cuenta (merge no destructivo de prefs). */
async function pushSnapshot(userId: string): Promise<void> {
  try {
    const supabase = createClient();
    const snap = getAgentsSnapshot();

    let prefs: Record<string, unknown> = {};
    try {
      const { data } = await supabase
        .from("user_settings")
        .select("prefs")
        .eq("user_id", userId)
        .maybeSingle();
      if (data?.prefs && typeof data.prefs === "object") {
        prefs = { ...(data.prefs as Record<string, unknown>) };
      }
    } catch {
      /* mezclamos sobre objeto vacío */
    }

    prefs.agents = snap.agents;
    prefs.agentBindings = snap.bindings;
    prefs.agentsPublic = snap.publicAgents;

    await supabase
      .from("user_settings")
      .upsert(
        { user_id: userId, prefs, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
  } catch {
    /* nunca rompemos: localStorage sigue siendo la verdad */
  }
}

/** Fuerza una subida inmediata de los agentes (si hay sesión). Defensivo. */
export async function syncAgentsNow(): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  await pushSnapshot(userId);
}

/**
 * useAgentsSync — móntalo UNA vez (junto a useLibrarySync). Fusión inicial al
 * montar y en cada cambio de sesión; push con debounce ante `starseed:library`.
 */
export function useAgentsSync(): void {
  useEffect(() => {
    if (!isClient()) return;

    const supabase = createClient();
    let active = true;
    let pushTimer: ReturnType<typeof setTimeout> | null = null;

    const schedulePush = () => {
      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = setTimeout(() => {
        void (async () => {
          const userId = await getUserId();
          if (!active || !userId) return;
          await pushSnapshot(userId);
        })();
      }, PUSH_DEBOUNCE_MS);
    };

    void (async () => {
      const userId = await getUserId();
      if (!active || !userId) return;
      await pullAndMerge(userId);
    })();

    const onChange = () => schedulePush();
    window.addEventListener(LIBRARY_EVENT, onChange);

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void (async () => {
        if (!active) return;
        const userId = session?.user?.id ?? null;
        if (userId) await pullAndMerge(userId);
      })();
    });

    return () => {
      active = false;
      if (pushTimer) clearTimeout(pushTimer);
      window.removeEventListener(LIBRARY_EVENT, onChange);
      try {
        sub.subscription.unsubscribe();
      } catch {
        /* noop */
      }
    };
  }, []);
}
