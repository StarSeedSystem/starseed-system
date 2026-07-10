"use client";

// ─────────────────────────────────────────────────────────────────────────────
// /profile — "Mi perfil" (resolutor de identidad REAL, sin datos demo)
// ----------------------------------------------------------------------------
// Antes redirigía siempre a /profile/starseeduser (un handle de EJEMPLO). Ahora
// resuelve la identidad real de la sesión:
//   • Sin sesión → invita a entrar / crear cuenta.
//   • Con sesión y perfil COMPLETO (handle real) → redirige a /profile/<handle>.
//   • Con sesión pero perfil INCOMPLETO → NO inventa identidad: pide primero
//     completar el perfil real (nombre + @ único) enlazando a Ajustes → Perfil.
//
// Aditivo y defensivo: SSR-safe ("use client"), tolerante a fallos (useAccount
// nunca rompe), y no bloquea la app. Reutiliza isProfileComplete/handle reales
// del account-context (fuente de verdad de la identidad soberana).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "@/context/account-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User, Loader2, LogIn } from "lucide-react";
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

  // ── Sin sesión: invitación honesta (sin identidad falsa) ──
  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <Card className="max-w-md w-full bg-background/40 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary" /> Tu perfil
            </CardTitle>
            <CardDescription>
              Inicia sesión con tu cuenta StarSeed para ver y editar tu identidad soberana.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login">
              <Button className="gap-2 cursor-pointer">
                <LogIn className="w-4 h-4" /> Entrar / Crear cuenta
              </Button>
            </Link>
          </CardContent>
        </Card>
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
