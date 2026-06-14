"use client";

// ════════════════════════════════════════════════════════════════
// AccountChip — indicador de cuenta del header (sesión real)
// ----------------------------------------------------------------
// Lee la sesión soberana vía useAccount():
//   • Con sesión → handle/displayName real + avatar (o iniciales).
//   • Sin sesión → chip "Entrar" (link a /login).
//   • Cargando   → skeleton sutil.
// Fallback elegante en todos los estados. SSR-safe ("use client").
// ════════════════════════════════════════════════════════════════

import Link from "next/link";
import { LogIn } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAccount } from "@/context/account-context";

function initialsOf(label: string): string {
    const parts = label.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "SS";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function AccountChip() {
    const { user, profile, loading } = useAccount();

    if (loading) {
        return (
            <div
                className="h-8 w-8 rounded-full bg-muted/30 animate-pulse"
                aria-busy
                aria-label="Cargando cuenta"
            />
        );
    }

    // ── Sin sesión: CTA "Entrar" ──
    if (!user) {
        return (
            <Link
                href="/login"
                className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-background/60 px-3 py-1.5 text-xs font-bold transition-colors hover:bg-white/10 cursor-pointer"
            >
                <LogIn className="size-3.5" />
                <span className="hidden sm:inline">Entrar</span>
            </Link>
        );
    }

    // ── Con sesión: handle/displayName real + avatar ──
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

    return (
        <Link
            href={handle ? `/profile/${handle}` : "/profile"}
            className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-background/60 py-1 pl-1 pr-3 transition-colors hover:bg-white/10 cursor-pointer"
            title={displayName}
        >
            <Avatar className="h-6 w-6">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                <AvatarFallback className="text-[10px] font-bold">
                    {initialsOf(displayName)}
                </AvatarFallback>
            </Avatar>
            <span className="hidden max-w-[10rem] truncate text-xs font-bold sm:inline">
                {handle ? `@${handle}` : displayName}
            </span>
        </Link>
    );
}
