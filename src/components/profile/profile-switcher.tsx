"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ProfileSwitcher · Cuenta soberana real (StarSeed)
// ----------------------------------------------------------------------------
// Muestra la cuenta soberana y el perfil REALES vía useAccount() (sin perfiles
// de ejemplo). Nombre, @, avatar y correo salen de la sesión y de la tabla
// `profiles`. Si falta algún dato → estado honesto ("Sin nombre", "sin @",
// "Inicia sesión"), nunca un nombre inventado.
//
// Las "facetas" (Personal/Cívico/Artístico/Profesional) son una función futura
// del Centro de Cuenta; aquí enlazamos a /cuenta para gestionarlas en lugar de
// mostrar datos ficticios.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import Link from "next/link";
import { useAccount } from "@/context/account-context";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ExternalLink, Plus, User, Leaf, LogIn, Settings2 } from "lucide-react";

function initialsOf(label: string): string {
    const parts = (label || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "SS";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function ProfileSwitcher() {
    const { user, profile, loading } = useAccount();

    // ── Cargando: esqueleto sutil ──
    if (loading) {
        return (
            <GlassCard intensity="medium" className="p-4 space-y-4">
                <div className="h-3 w-32 bg-muted/30 rounded animate-pulse" />
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted/30 animate-pulse" />
                    <div className="space-y-2">
                        <div className="h-3 w-28 bg-muted/30 rounded animate-pulse" />
                        <div className="h-2.5 w-40 bg-muted/20 rounded animate-pulse" />
                    </div>
                </div>
            </GlassCard>
        );
    }

    // ── Sin sesión: invitación honesta ──
    if (!user) {
        return (
            <GlassCard intensity="medium" className="p-4 space-y-4">
                <div className="flex items-center gap-2">
                    <Leaf className="w-4 h-4 text-primary opacity-70" />
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Cuenta StarSeed
                    </span>
                </div>
                <p className="text-sm text-muted-foreground">
                    Inicia sesión para gestionar tu identidad soberana, perfil y correos.
                </p>
                <Link href="/login" className="cursor-pointer">
                    <Button size="sm" className="gap-2 cursor-pointer">
                        <LogIn className="w-3.5 h-3.5" /> Entrar / Crear cuenta
                    </Button>
                </Link>
            </GlassCard>
        );
    }

    // ── Con sesión: datos reales con fallback honesto ──
    const displayName =
        (profile?.display_name as string | undefined) ||
        (profile?.full_name as string | undefined) ||
        (profile?.name as string | undefined) ||
        (user.user_metadata?.full_name as string | undefined) ||
        "";

    const handle =
        (profile?.handle as string | undefined) ||
        (profile?.username as string | undefined) ||
        null;

    const avatarUrl =
        (profile?.avatar_url as string | undefined) ||
        (user.user_metadata?.avatar_url as string | undefined) ||
        undefined;

    const email = user.email ?? null;
    const profileHref = handle ? `/profile/${handle}` : "/profile";

    return (
        <GlassCard intensity="medium" className="p-4 space-y-4">
            {/* ── Encabezado: Cuenta soberana ── */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Leaf className="w-4 h-4 text-primary opacity-70" />
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Cuenta StarSeed
                    </span>
                </div>
                <Badge variant="outline" className="text-[10px] px-2 py-0 border-primary/30 text-primary bg-primary/5">
                    Soberana
                </Badge>
            </div>

            {/* ── Identidad real ── */}
            <div className="flex items-center gap-3 px-1">
                <Avatar className="w-11 h-11 border border-white/10 shrink-0">
                    {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName || "avatar"} /> : null}
                    <AvatarFallback className="bg-gradient-to-br from-primary/50 to-accent/50 text-xs font-bold">
                        {displayName || handle ? initialsOf(displayName || handle || "") : "SS"}
                    </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold leading-tight truncate">
                        {displayName || "Sin nombre"}
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-tight truncate">
                        {handle ? "@" + handle : email || "sin @"}
                    </p>
                </div>
            </div>

            {/* ── Acciones de cuenta ── */}
            <div className="border-t border-white/8 pt-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                    <Link href={profileHref} className="cursor-pointer">
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full gap-2 border-white/10 bg-white/5 hover:bg-white/10 text-xs cursor-pointer"
                        >
                            <User className="w-3.5 h-3.5" />
                            Ver perfil
                            <ExternalLink className="w-3 h-3 ml-auto opacity-60" />
                        </Button>
                    </Link>
                    <Link href="/cuenta" className="cursor-pointer">
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full gap-2 border-white/10 bg-white/5 hover:bg-white/10 text-xs cursor-pointer"
                        >
                            <Settings2 className="w-3.5 h-3.5" />
                            Gestionar cuenta
                        </Button>
                    </Link>
                </div>

                {/* Facetas: función futura, declarada honestamente (sin perfiles falsos). */}
                <Link
                    href="/cuenta"
                    className="flex items-center gap-2 text-[11px] text-muted-foreground hover:text-primary transition-colors cursor-pointer px-1 pt-1"
                    title="Las facetas de perfil se gestionan en el Centro de Cuenta"
                >
                    <Plus className="w-3 h-3" />
                    Crear facetas de perfil (Personal · Cívico · Profesional)
                </Link>
            </div>
        </GlassCard>
    );
}
