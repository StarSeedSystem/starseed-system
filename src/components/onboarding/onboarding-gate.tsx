"use client";

/**
 * OnboardingGate — portero de primera ejecución y lanzador de la guía con
 * Astraura. Tras auth.getUser(), decide si mostrar el wizard:
 *
 *   • No hay usuario           → no renderiza nada (AuthGate cubre la app).
 *   • Hay usuario SIN perfil   → muestra el wizard (creación de cuenta guiada,
 *                                 incluye invitados/anónimos sin correo).
 *   • Hay usuario con perfil    → solo si el onboarding no está completado.
 *
 * Así, tras registrarse, entrar por primera vez o explorar como invitado, la
 * guía dinámica arranca sola: el usuario solo acepta permisos y elige opciones.
 *
 * Es seguro montarlo una sola vez globalmente (el orquestador lo coloca en
 * (app)/layout.tsx). Escucha el evento `window` "starseed:open-onboarding" para
 * reabrir la guía en cualquier momento (lo dispara, p.ej., "Explorar sin cuenta").
 *
 * Fail-open: ante cualquier error de red/SSR no bloquea la app (no muestra nada).
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { getOnboarding } from "@/lib/onboarding/onboarding";
import OnboardingWizard from "@/components/onboarding/onboarding-wizard";
import NeuronSetup from "@/components/onboarding/neuron-setup";

export function OnboardingGate() {
  const [ready, setReady] = useState(false);
  const [show, setShow] = useState(false);
  // Adenda 188: neurona nueva con cuenta ya iniciada → alta corta especializada.
  const [showNeuron, setShowNeuron] = useState(false);

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

      // ¿Ya tiene perfil en la red? Si NO, la guía debe arrancar para que cree
      // su identidad (vale también para invitados anónimos, que aún no tienen
      // perfil ni correo). Best-effort: ante error, caemos al estado de onboarding.
      let hasProfile = false;
      try {
        const { data: prof } = await sb
          .from("profiles")
          .select("handle")
          .eq("user_id", user.id)
          .maybeSingle();
        hasProfile = !!(prof && (prof as { handle?: string }).handle);
      } catch {
        hasProfile = false;
      }

      if (!hasProfile) {
        // Cuenta nueva / invitado sin identidad → guía de creación guiada.
        setShow(true);
        setReady(true);
        return;
      }

      const ob = await getOnboarding();
      if (!ob.completed) {
        setShow(true);
      } else {
        setShow(false);
        // Cuenta YA iniciada pero este dispositivo/medio nunca se configuró →
        // alta corta de neurona: solo cerebros y modo de sincronización.
        try {
          const marca = window.localStorage.getItem("starseed.neuron.setup.v1");
          if (!marca) setShowNeuron(true);
        } catch { /* fail-open */ }
      }
    } catch {
      setShow(false);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    void check();

    // Reabrir bajo demanda desde cualquier parte de la app (y desde el acceso
    // como invitado, que dispara este evento al crear la sesión anónima).
    const onOpen = () => setShow(true);
    window.addEventListener("starseed:open-onboarding", onOpen);

    // Cuando cambie la sesión (login / signup / invitado / logout) reevaluamos.
    let unsub: (() => void) | undefined;
    try {
      const sb = createClient();
      const { data: sub } = sb.auth.onAuthStateChange(() => { void check(); });
      unsub = () => sub.subscription.unsubscribe();
    } catch { /* fail-open */ }

    return () => {
      window.removeEventListener("starseed:open-onboarding", onOpen);
      unsub?.();
    };
  }, [check]);

  if (!ready) return null;
  if (show) return <OnboardingWizard onClose={() => setShow(false)} />;
  if (showNeuron) return <NeuronSetup onClose={() => setShowNeuron(false)} />;
  return null;
}

export default OnboardingGate;
