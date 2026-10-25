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
 *     (<PaginaAcceso>: LA ventana de acceso única, la misma de /login y del primer arranque,
 *     Ola 1025T · ACC1025A): entrar o crear cuenta. Nada de guía todavía.
 *   · Con cuenta REAL (tiene correo) y el rito pendiente → arranca la guía con Astraura.
 *   · Con cuenta REAL y nada pendiente (entró una cuenta ya configurada) → a los escritorios.
 *
 * En cuanto el registro termina, `onAuthStateChange` reevalúa y la guía aparece
 * sola: no hay que recargar ni volver a navegar.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import OnboardingWizard from "@/components/onboarding/onboarding-wizard";
import { PaginaAcceso } from "@/components/auth/ventana-acceso";
import { etapaActual, iniciarRito, navegarSuave } from "@/lib/onboarding/director-rito";

type Estado = "comprobando" | "sin-cuenta" | "con-cuenta" | "lista";

/** Esperas (ms) entre reintentos de `getUser` cuando la red va lenta o caída. */
const ESPERAS_REINTENTO = [500, 1000, 2000] as const;

function esperar(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

export default function BienvenidaPage() {
  const [estado, setEstado] = useState<Estado>("comprobando");
  const router = useRouter();
  // (DSB1010 · 2026-10-10) Al cerrar la guía con la X, Esc o «Saltar por ahora» no se queda
  // una página vacía con el título: se vuelve al Escritorio (navegación suave del rito).
  const alCerrar = useCallback(() => navegarSuave(router, "/escritorios"), [router]);

  const comprobar = useCallback(async () => {
    try {
      const sb = createClient();

      // (Ola 247 · 2026-09-05) PRIMERO la sesión LOCAL: `getSession` lee la
      // cookie/el almacenamiento, sin red. Antes la primera llamada era
      // `getUser` (red) y, con la máquina cargada o un transporte lento, podía
      // fallar o tardar; entonces la página enseñaba <AuthGate> = un SEGUNDO
      // formulario de acceso a alguien que acababa de registrarse. Con la
      // sesión local decidimos «con-cuenta» AL INSTANTE y solo después
      // confirmamos por red en segundo plano.
      const { data: s } = await sb.auth.getSession();
      let user = s?.session?.user ?? null;
      // Cuenta REAL = tiene correo y no es una sesión anónima de invitado.
      let registrada =
        !!user && !!user.email && !(user as { is_anonymous?: boolean }).is_anonymous;

      // Si la sesión local está vacía puede ser simplemente que el cliente aún
      // no haya refrescado tras el alta. `getUser` (red) se reintenta con
      // esperas crecientes (500, 1000, 2000 ms) antes de rendirse y pedir
      // acceso: nunca se decide «sin-cuenta» por un fallo transitorio suelto.
      if (!registrada) {
        for (let intento = 0; intento < ESPERAS_REINTENTO.length; intento += 1) {
          try {
            await esperar(ESPERAS_REINTENTO[intento]);
            const { data, error } = await sb.auth.getUser();
            if (!error && data?.user && !!data.user.email &&
                !(data.user as { is_anonymous?: boolean }).is_anonymous) {
              user = data.user;
              registrada = true;
              break;
            }
            if (!error && !data?.user) break; // respuesta CLARA: no hay usuario
            // error de red transitorio → siguiente reintento con más espera
          } catch {
            /* fallo transitorio: se reintenta */
          }
        }
      }

      if (registrada && user) {
        // El DIRECTOR del rito manda (Ola 247): la etapa actual sustituye a la
        // marca suelta `starseed.recien.registrado` como señal de «esto es el
        // rito». Además: una cuenta con sesión y SIN perfil acaba de nacer por
        // definición, y quien tiene el rito SIN TERMINAR (onboarding ni
        // completado ni pospuesto) estaba dentro de la configuración inicial
        // (Adendas 209/215/221): recargar devuelve a la misma ventana.
        const etapa = etapaActual();
        let sinPerfil = false;
        let sinTerminar = false;
        try {
          const { data: prof } = await sb
            .from("profiles").select("handle").eq("user_id", user.id).maybeSingle();
          if (!(prof && (prof as { handle?: string }).handle)) {
            sinPerfil = true;
          } else {
            const { getOnboarding } = await import("@/lib/onboarding/onboarding");
            const ob = await getOnboarding();
            // (Ola 221) El rito saltado es «pospuesto», no «sin terminar»:
            // no se reabre en bucle, se relanza a mano.
            sinTerminar = !ob?.completed && !ob?.skipped;
          }
        } catch {
          // Red caída: NO se decide contra la persona. Con sesión local y rito
          // declarado se entra igual; sin rito, se prefiere mostrar el acceso.
          sinPerfil = false;
          sinTerminar = false;
        }

        if (etapa === "bienvenida" || sinPerfil || etapa !== null || sinTerminar) {
          // Si hay sesión real y no hay perfil pero NADIE inició el rito
          // (pestaña nueva, sesión restaurada, marca perdida), lo arranca esta
          // página: el rito nunca se queda huérfano.
          if (!etapa && sinPerfil) iniciarRito();
          // «con-cuenta» es una vía de un solo sentido: una vez mostrada la
          // guía, un fallo de red posterior NO la quita de debajo.
          setEstado("con-cuenta");
          return;
        }
        // Cuenta real, perfil hecho y rito terminado: no hay nada que enseñar aquí. Antes caía a
        // «sin-cuenta» y <AuthGate> (que no pinta con sesión) dejaba la página en blanco.
        // «con-cuenta» no se quita: si la guía ya está a la vista, una relectura (renovar el token, un fallo
        // de red) no la saca de debajo de quien la está usando.
        setEstado((previo) => (previo === "con-cuenta" ? previo : "lista"));
        return;
      }

      setEstado("sin-cuenta");
    } catch {
      // Fail-safe: ante un fallo NO se enseña la guía, se pide acceso.
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

  // (Ola 247 · 2026-09-05) La voz lista desde que se abre esta ventana. Igual que en
  // /login: precalentamos el motor neuronal en cuanto se monta y lo MANTENEMOS caliente
  // mientras el rito esté a la vista (el daemon vuelve a dormirse a los 10 min y la
  // primera narración no debe volver a esperar ~22 s). `mantenerCaliente` devuelve la
  // función de parada, que se invoca al desmontar. Todo con import dinámico y envuelto:
  // si la voz no está disponible, el rito sigue funcionando igual.
  useEffect(() => {
    let detener: (() => void) | undefined;
    try {
      void import("@/lib/aurora/voz-starseed/motor").then((m) => m.precalentar()).catch(() => null);
      void import("@/lib/aurora/motor-local").then((ml) => {
        detener = ml.mantenerCaliente(
          () => document.visibilityState !== "hidden" && !window.location.pathname.startsWith("/login"),
        );
      }).catch(() => null);
    } catch { /* la voz nunca debe romper la bienvenida */ }
    return () => detener?.();
  }, []);

  // Cuenta ya configurada: a los escritorios (navegación suave del rito).
  useEffect(() => {
    if (estado === "lista") navegarSuave(router, "/escritorios");
  }, [estado, router]);

  // Mientras se comprueba no se enseña nada: ni guía ni acceso parpadeando.
  if (estado === "comprobando" || estado === "lista") return null;

  // Sin registro: la ventana de acceso única ocupa la pantalla. Al entrar la página se queda
  // (`destinoAlEntrar={null}`): `onAuthStateChange` reevalúa y decide el rito o los escritorios.
  if (estado === "sin-cuenta") {
    return <PaginaAcceso desde="bienvenida" pasoInicial="acceso" pestanaInicial="signin" destinoAlEntrar={null} />;
  }

  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-amber-50">Bienvenida · Guía de StarSeed con Astraura</h1>
        <p className="text-sm text-white/50 mt-1 mb-6">
          Repasa cómo vincular, conectar, crear, publicar y usar cada área de la red. Crea tu identidad (@handle),
          tu dirección StarSeed y tu recuperación, o empieza con la voz de Aurora.
        </p>
        <OnboardingWizard onClose={alCerrar} />
      </div>
    </main>
  );
}
