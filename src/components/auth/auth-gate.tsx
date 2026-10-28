"use client";

// ─────────────────────────────────────────────────────────────────────────────
// AuthGate — el portero de acceso: sin sesión, pinta LA ventana de acceso única
// ─────────────────────────────────────────────────────────────────────────────
// (Ola 1025T · ACC1025A) Antes pintaba su propio diseño («StarSeed OS · Inicia sesión…», con su
// formulario, su código por correo y su «Explorar sin cuenta» de sesión anónima) y era una de las tres
// ventanas de acceso. Ya no pinta nada propio: si no hay sesión, monta <PaginaAcceso>
// (`ventana-acceso.tsx`), la misma ventana que /login, /bienvenida y el primer arranque, y el formulario
// —incluido «Entrar con código por correo (sin contraseña)», con las mismas rutas /api/auth/otp/*— vive
// en `auth-form.tsx` y `lib/auth/codigo-correo.ts`.
//
// Se conserva por compatibilidad (`app-providers.tsx` lo importa) y por la marca RECIEN_REGISTRADO.
// Fail-open: si el chequeo de sesión falla (red/SSR), no bloquea la app.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { PaginaAcceso } from "@/components/auth/ventana-acceso";

/**
 * (Adenda 208) Marca de sesión que dice «esta persona ACABA de crear su cuenta
 * en esta pestaña». Solo entonces arranca sola la guía de Astraura.
 */
export const RECIEN_REGISTRADO = "starseed.recien.registrado";

export function AuthGate() {
  const [sb] = useState(() => createClient());
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  const check = useCallback(async () => {
    try {
      const { data } = await sb.auth.getSession();
      setAuthed(!!data?.session);
    } catch {
      setAuthed(true); // fail-open: nunca dejar al usuario fuera por un error
    } finally {
      setReady(true);
    }
  }, [sb]);

  useEffect(() => {
    void check();
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => setAuthed(!!session));
    return () => sub.subscription.unsubscribe();
  }, [check, sb]);

  if (!ready || authed) return null;

  // La página decide qué hacer al entrar (el rito, los escritorios): la ventana se queda.
  // (Ola 1021G · GUI1021K1, §5 de `architecture/guias-introduccion.md`) La puerta del acceso YA no es
  // «la bienvenida»: esa ruta monta su propia `PaginaAcceso`. Aquí el botón «Conoce StarSeed» que la
  // ventana única enseña bajo Entrar y Crear cuenta abre la guía con `desde: "login"` y sin tocar el
  // inicio de sesión: ni entra, ni registra, ni deja al usuario en bucle.
  return <PaginaAcceso desde="login" pasoInicial="acceso" pestanaInicial="signin" destinoAlEntrar={null} />;
}

export default AuthGate;
