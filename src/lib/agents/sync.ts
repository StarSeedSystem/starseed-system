"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * StarSeed OS — Agentes · SINCRONIZACIÓN con la cuenta soberana
 * ---------------------------------------------------------------------------
 * Lleva los AGENTES, sus VÍNCULOS (bindings) y el registro público "stub" a la
 * cuenta soberana DEL OS — Supabase **`nxstilnyidvkqeosofuh`**, tabla
 * `user_settings`, jsonb `prefs`. ⚠️ Ref corregida el 2026-07-12: NO es
 * `dzkjapinnewkxzjltadv` (ese es el proyecto de Nexus/Café) y las cuentas del OS
 * NO se comparten con ellos (CLAUDE.md §2). Sigue EXACTAMENTE el patrón de
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
import { mergeUserPrefs } from "@/lib/sync/user-prefs";
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

/**
 * Sube el snapshot de agentes a la cuenta.
 *
 * Adenda 69 · A — antes esto LEÍA `prefs`, le añadía sus 3 claves y hacía
 * `upsert` de la COLUMNA ENTERA. Como los otros ~11 módulos que comparten
 * `user_settings.prefs` hacen lo mismo a la vez al cargar la página, el último
 * en escribir borraba todo lo que los demás hubieran guardado tras su lectura
 * (lost update). Medido en producción: este mismo push dejó la fila en 4 claves
 * (`agents`, `dashboards`, `agentsPublic`, `agentBindings`) y se llevó por
 * delante las de Aurora/Astraura que realtime-sync acababa de subir.
 *
 * Ahora se manda SOLO el parche y Postgres lo funde de forma atómica.
 */
async function pushSnapshot(userId: string): Promise<void> {
  try {
    const snap = getAgentsSnapshot();
    await mergeUserPrefs(
      {
        agents: snap.agents,
        agentBindings: snap.bindings,
        agentsPublic: snap.publicAgents,
      },
      { userId },
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
