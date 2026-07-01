"use client";

// ════════════════════════════════════════════════════════════════════════════
// WelcomeGate — decide si mostrar la ventana de bienvenida/especificaciones
// ----------------------------------------------------------------------------
// Muestra <WelcomeWindow> SOLO cuando:
//   • NO hay sesión StarSeed activa (comprobado con Supabase), y
//   • no se ha visto/descartado ya en esta sesión del navegador.
//
// Al pulsar "Continuar", se oculta y (opcionalmente) avisa al consumidor para
// que enfoque el formulario de login. Reutilizable desde /login y desde el
// AuthGate global. Aditivo y defensivo: si el chequeo de sesión falla, NO
// bloquea nada (fail-open → no muestra bienvenida, deja pasar al login).
// SSR-safe: la detección vive en un efecto; no renderiza en el primer paso.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { WelcomeWindow, shouldShowWelcome } from "@/components/welcome/welcome-window";

export interface WelcomeGateProps {
  /** Se llama cuando el usuario pulsa "Continuar" (bienvenida cerrada). */
  onContinue?: () => void;
}

export function WelcomeGate({ onContinue }: WelcomeGateProps) {
  const [ready, setReady] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let alive = true;

    const evaluate = async () => {
      // Si ya se descartó en esta sesión, no molestamos.
      if (!shouldShowWelcome()) {
        if (alive) {
          setShow(false);
          setReady(true);
        }
        return;
      }
      try {
        const sb = createClient();
        const { data } = await sb.auth.getSession();
        const hasSession = !!data?.session;
        if (alive) {
          // Solo si NO hay sesión mostramos la bienvenida.
          setShow(!hasSession);
          setReady(true);
        }
      } catch {
        // fail-open: ante error, no bloqueamos con la bienvenida.
        if (alive) {
          setShow(false);
          setReady(true);
        }
      }
    };

    void evaluate();

    // Si aparece una sesión (login en otra pestaña / SSO), retiramos la bienvenida.
    let unsub: (() => void) | undefined;
    try {
      const sb = createClient();
      const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
        if (session && alive) setShow(false);
      });
      unsub = () => sub.subscription.unsubscribe();
    } catch {
      /* sin suscripción: sigue funcionando */
    }

    return () => {
      alive = false;
      unsub?.();
    };
  }, []);

  const handleContinue = useCallback(() => {
    setShow(false);
    onContinue?.();
  }, [onContinue]);

  if (!ready || !show) return null;

  return <WelcomeWindow onContinue={handleContinue} />;
}

export default WelcomeGate;
