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

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "@/context/account-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { User, Loader2, Settings, LogIn } from "lucide-react";

export default function ProfileIndexPage() {
  const router = useRouter();
  const { user, profile, loading } = useAccount();

  // Handle real del usuario (sin placeholders demo: account-context ya sanea).
  const handle =
    (profile?.handle as string | undefined) ||
    (profile?.username as string | undefined) ||
    null;

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

  // ── Con sesión pero SIN @ real: exigir completar el perfil ANTES de mostrar
  //    ninguna identidad de ejemplo. No inventamos "starseeduser" ni similares. ──
  return (
    <div className="flex flex-1 items-center justify-center py-12">
      <Card className="max-w-md w-full bg-background/40 backdrop-blur-sm border-amber-500/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-amber-400" /> Completa tu perfil real
          </CardTitle>
          <CardDescription>
            Aún no tienes una identidad pública. Elige tu <b>nombre visible</b> y un{" "}
            <b>@ único</b> para activar tu perfil. No usamos datos genéricos por defecto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/settings">
            <Button className="gap-2 cursor-pointer">
              <Settings className="w-4 h-4" /> Crear mi identidad
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
