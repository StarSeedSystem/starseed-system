"use client";

/**
 * OnboardingGate — portero de primera ejecución. Tras auth.getUser(), carga
 * onboarding_state; si no está completado, monta el wizard como modal. Si está
 * completado o no hay usuario, no renderiza nada.
 *
 * Es seguro montarlo una sola vez globalmente (el orquestador lo coloca en
 * (app)/layout.tsx). También escucha el evento `window` "starseed:open-onboarding"
 * para reabrir la guía en cualquier momento.
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { getOnboarding } from "@/lib/onboarding/onboarding";
import OnboardingWizard from "@/components/onboarding/onboarding-wizard";

export function OnboardingGate() {
  const [ready, setReady] = useState(false);
  const [show, setShow] = useState(false);

  const check = useCallback(async () => {
    try {
      const sb = createClient();
      const { data } = await sb.auth.getUser();
      const user = data?.user ?? null;
      if (!user) {
        setShow(false);
        setReady(true);
        return;
      }
      const ob = await getOnboarding();
      setShow(!ob.completed);
    } catch {
      setShow(false);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    void check();

    // Reabrir bajo demanda desde cualquier parte de la app.
    const onOpen = () => setShow(true);
    window.addEventListener("starseed:open-onboarding", onOpen);
    return () => window.removeEventListener("starseed:open-onboarding", onOpen);
  }, [check]);

  if (!ready || !show) return null;

  return <OnboardingWizard onClose={() => setShow(false)} />;
}

export default OnboardingGate;
