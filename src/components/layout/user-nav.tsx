"use client";

// ════════════════════════════════════════════════════════════════
// UserNav — menú de cuenta del header (sesión real)
// ----------------------------------------------------------------
// Lee la sesión soberana vía useAccount(): nombre / @handle / avatar
// reales del usuario logueado (profiles/cafe_profiles vía Supabase).
// Sin sesión → CTA "Entrar". Sin datos personales de ejemplo.
// ════════════════════════════════════════════════════════════════

import Link from "next/link";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { User, Settings, LogOut, LogIn } from "lucide-react";
import { useAccount } from "@/context/account-context";

function initialsOf(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "SS";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function UserNav() {
  const { user, profile, loading, signOut } = useAccount();

  if (loading) {
    return <div className="h-8 w-8 rounded-full bg-muted/30 animate-pulse" aria-busy aria-label="Cargando cuenta" />;
  }

  // ── Sin sesión: CTA "Entrar" ──
  if (!user) {
    return (
      <Button asChild variant="ghost" className="relative h-8 gap-1.5 rounded-full px-3 text-xs font-bold">
        <Link href="/login">
          <LogIn className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Entrar</span>
        </Link>
      </Button>
    );
  }

  const displayName =
    (profile?.display_name as string | undefined) ||
    (profile?.full_name as string | undefined) ||
    (profile?.handle as string | undefined) ||
    (profile?.username as string | undefined) ||
    (user.user_metadata?.full_name as string | undefined) ||
    (user.email?.split("@")[0] ?? "Cuenta");

  const handle =
    (profile?.handle as string | undefined) ||
    (profile?.username as string | undefined) ||
    null;

  const avatarUrl =
    (profile?.avatar_url as string | undefined) ||
    (user.user_metadata?.avatar_url as string | undefined) ||
    undefined;

  const email = user.email ?? "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-8 w-8">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} data-ai-hint="user avatar" />}
            <AvatarFallback>{initialsOf(displayName)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{handle ? `@${handle}` : displayName}</p>
            {email && (
              <p className="text-xs leading-none text-muted-foreground">{email}</p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href={handle ? `/profile/${handle}` : "/profile"}>
              <User className="mr-2 h-4 w-4" />
              <span>Perfil</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings className="mr-2 h-4 w-4" />
              <span>Configuración</span>
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => { void signOut(); }}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Cerrar Sesión</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
