"use client";

// ════════════════════════════════════════════════════════════════════════════
// LoginExperience — la ruta /login, ahora con LA ventana de acceso única
// ----------------------------------------------------------------------------
// (Ola 1025T · ACC1025A) Antes pintaba su propio diseño («Identidad Digital»: logo + tarjeta con
// <AuthForm>, más la bienvenida previa <WelcomeGate>). Ya no pinta nada propio: delega en
// <PaginaAcceso> (`ventana-acceso.tsx`), la misma ventana que /bienvenida y el primer arranque.
// La ruta sigue existiendo —hay enlaces guardados—, abre en la cuenta (Entrar) y conserva:
//   · el `?next=` seguro (lo resuelve <AuthForm> al entrar);
//   · el «Continuar como…» (SSO #93) cuando ya hay una sesión StarSeed en el dispositivo, dentro de
//     la propia tarjeta y respetando ese `?next=`.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { siguienteDeBusqueda } from "@/lib/auth/siguiente-seguro";
import { SessionResumePrompt } from "@/components/sso/session-resume-prompt";
import { PaginaAcceso } from "@/components/auth/ventana-acceso";

export function LoginExperience() {
  // (2026-09-28) «Continuar como…» también respeta un `?next=` seguro (p. ej. volver a
  // `/llamada/<id>`). Se lee tras montar para no exigir <Suspense> a la página.
  const [siguiente, setSiguiente] = useState<string | null>(null);
  useEffect(() => {
    const s = siguienteDeBusqueda(window.location.search, "");
    setSiguiente(s || null);
  }, []);
  return (
    <PaginaAcceso
      desde="login"
      pasoInicial="acceso"
      pestanaInicial="signin"
      avisoReanudar={<SessionResumePrompt incrustada {...(siguiente ? { redirectTo: siguiente } : {})} />}
    />
  );
}

export default LoginExperience;
