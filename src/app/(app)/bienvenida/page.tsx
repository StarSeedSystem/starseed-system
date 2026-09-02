"use client";

/**
 * /bienvenida — la puerta de entrada del OS.
 * ─────────────────────────────────────────────────────────────────────────────
 * (Adenda 207) ANTES esta página montaba el wizard SIN comprobar nada, y como
 * los accesos «Entrar / Crear cuenta» de la app apuntan aquí, la guía de
 * Astraura aparecía antes de que la persona hubiera puesto su correo y su
 * contraseña. Arreglar el portero global (Adenda 205) no bastaba: esta ruta lo
 * saltaba por completo.
 *
 * Ahora la página decide:
 *   · Sin sesión, o con sesión ANÓNIMA (invitado) → se muestra el acceso
 *     (<AuthGate>): entrar o crear cuenta. Nada de guía todavía.
 *   · Con cuenta REAL (tiene correo) → arranca la guía con Astraura.
 *
 * En cuanto el registro termina, `onAuthStateChange` reevalúa y la guía aparece
 * sola: no hay que recargar ni volver a navegar.
 */

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import OnboardingWizard from "@/components/onboarding/onboarding-wizard";
import AuthGate, { RECIEN_REGISTRADO } from "@/components/auth/auth-gate";

type Estado = "comprobando" | "sin-cuenta" | "con-cuenta";

export default function BienvenidaPage() {
  const [estado, setEstado] = useState<Estado>("comprobando");

  const comprobar = useCallback(async () => {
    try {
      const sb = createClient();
      const { data } = await sb.auth.getUser();
      const user = data?.user ?? null;
      // Cuenta REAL = tiene correo y no es una sesión anónima de invitado.
      const registrada =
        !!user && !!user.email && !(user as { is_anonymous?: boolean }).is_anonymous;
      // (Adenda 208) La guía se muestra a quien ACABA de crear su cuenta. Quien
      // ya la tenía y entra por aquí ve el acceso, y desde dentro del OS puede
      // reabrir la guía cuando quiera.
      let recien = false;
      try { recien = window.sessionStorage.getItem(RECIEN_REGISTRADO) === "1"; } catch { /* */ }

      // (Adenda 209) La marca de sesión no puede ser el ÚNICO criterio: si algo
      // recarga por el camino y se pierde, la persona se queda sin rito. Una
      // cuenta con sesión y SIN perfil acaba de nacer por definición, así que
      // también entra. Quien ya tiene su identidad creada no lo ve.
      // (Adenda 215) Recargar debe DEVOLVERTE a la misma ventana. Antes solo
      // entraba quien no tuviera perfil todavía, así que en cuanto creabas tu
      // identidad (paso 2) una recarga te dejaba fuera y no podías seguir
      // probando. Ahora entra también quien tenga el rito SIN TERMINAR: es
      // exactamente quien estaba dentro de la configuración inicial.
      let sinTerminar = false;
      if (registrada) {
        try {
          const { data: prof } = await sb
            .from("profiles").select("handle").eq("user_id", user!.id).maybeSingle();
          if (!(prof && (prof as { handle?: string }).handle)) {
            sinTerminar = true;
          } else {
            const { getOnboarding } = await import("@/lib/onboarding/onboarding");
            const ob = await getOnboarding();
            sinTerminar = !ob?.completed;
          }
        } catch { sinTerminar = false; }
      }
      setEstado(registrada && (recien || sinTerminar) ? "con-cuenta" : "sin-cuenta");
    } catch {
      // Fail-safe: ante un fallo de red NO se enseña la guía, se pide acceso.
      setEstado("sin-cuenta");
    }
  }, []);

  useEffect(() => {
    void comprobar();
    let unsub: (() => void) | undefined;
    try {
      const sb = createClient();
      const { data: sub } = sb.auth.onAuthStateChange(() => { void comprobar(); });
      unsub = () => sub.subscription.unsubscribe();
    } catch { /* sin realtime de auth: basta la comprobación inicial */ }
    return () => unsub?.();
  }, [comprobar]);

  // Mientras se comprueba no se enseña nada: ni guía ni acceso parpadeando.
  if (estado === "comprobando") return null;

  // Sin registro: el acceso ocupa la pantalla. AuthGate se desmonta solo
  // cuando la sesión pasa a estar activa.
  if (estado === "sin-cuenta") return <AuthGate />;

  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-amber-50">Bienvenida · Guía de StarSeed con Astraura</h1>
        <p className="text-sm text-white/50 mt-1 mb-6">
          Repasa cómo vincular, conectar, crear, publicar y usar cada área de la red. Crea tu identidad (@handle),
          tu dirección StarSeed y tu recuperación, o empieza con la voz de Aurora.
        </p>
        <OnboardingWizard />
      </div>
    </main>
  );
}
