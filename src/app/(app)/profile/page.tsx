"use client";

// ─────────────────────────────────────────────────────────────────────────────
// /profile — "Mi perfil" (resolutor de identidad REAL, sin datos demo)
// ----------------------------------------------------------------------------
// Antes redirigía siempre a /profile/starseeduser (un handle de EJEMPLO). Ahora
// resuelve la identidad real de la sesión:
//   • Sin sesión → la PUERTA de sesión (Ola 1025T · ACC1025B): el perfil por defecto vacío, difuminado,
//     con «Te damos la bienvenida a StarSeed OS» delante (entrar o crear cuenta, ver la introducción,
//     explorar sin cuenta). Ya no hay tarjeta suelta «Tu perfil · Inicia sesión…».
//   • Con sesión y perfil COMPLETO (handle real) → redirige a /profile/<handle>.
//   • Con sesión pero perfil INCOMPLETO → NO inventa identidad: pide primero
//     completar el perfil real (nombre + @ único) enlazando a Ajustes → Perfil.
//
// Aditivo y defensivo: SSR-safe ("use client"), tolerante a fallos (useAccount
// nunca rompe), y no bloquea la app. Reutiliza isProfileComplete/handle reales
// del account-context (fuente de verdad de la identidad soberana).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "@/context/account-context";
import { Loader2 } from "lucide-react";
import { PuertaSesion } from "@/components/auth/puerta-sesion";
import { AccountProfilesSwitcher } from "@/components/profiles/account-profiles-switcher";
import { useActiveProfile } from "@/lib/profiles/profiles";

export default function ProfileIndexPage() {
  const router = useRouter();
  const { user, profile: mainProfile, loading: accountLoading } = useAccount();
  const { profile: activeProfile, loading: activeLoading } = useActiveProfile();

  // Handle real del usuario (sin placeholders demo: account-context ya sanea).
  // Si la identidad soberana no tiene, probamos con la faceta activa.
  const handle =
    (mainProfile?.username as string | undefined) ||
    (mainProfile?.handle as string | undefined) ||
    (activeProfile?.handle as string | undefined) ||
    null;

  const loading = accountLoading || activeLoading;

  // Si hay sesión y un @ real, llevamos al perfil público real.
  useEffect(() => {
    if (!loading && user && handle) {
      router.replace(`/profile/${handle}`);
    }
  }, [loading, user, handle, router]);

  // ── Cargando o a punto de redirigir: spinner sobrio ──
  if (loading || (user && handle)) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Cargando tu perfil" />
      </div>
    );
  }

  // ── Sin sesión: la puerta (la vista previa del perfil vacío y la bienvenida), sin identidad falsa ──
  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center px-3 py-4 sm:px-6">
        <PuertaSesion vista="perfil" nombrePagina="Tu perfil" />
      </div>
    );
  }

  // ── Con sesión pero SIN @ real: mostrar directamente el creador de perfiles
  //    (se abrirá su modal interno automáticamente si está vacío). ──
  return (
    <div className="flex flex-1 items-center justify-center py-12 px-4">
      <div className="w-full max-w-md">
        <Suspense fallback={<Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />}>
            <AccountProfilesSwitcher />
        </Suspense>
      </div>
    </div>
  );
}
