"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAccount } from "@/context/account-context";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    ChevronDown,
    CheckCircle2,
    ExternalLink,
    Plus,
    User,
    Landmark,
    Palette,
    Briefcase,
    Leaf,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Tipos ──────────────────────────────────────────────────────────────────────
interface ProfileFacet {
    handle: string;
    displayName: string;
    facet: "Personal" | "Cívico" | "Artístico" | "Profesional" | "Comunitario";
    initials: string;
    accentClass: string;
    icon: React.ComponentType<{ className?: string }>;
}

// ── Perfiles de muestra (fallback si la cuenta no expone perfiles) ─────────────
const DEMO_PROFILES: ProfileFacet[] = [
    {
        handle: "alex_starseed",
        displayName: "Alex",
        facet: "Personal",
        initials: "AL",
        accentClass: "from-primary/70 to-accent/70",
        icon: User,
    },
    {
        handle: "alex.civica",
        displayName: "Alex · Ciudadano",
        facet: "Cívico",
        initials: "CV",
        accentClass: "from-[#007FFF]/70 to-[#007FFF]/30",
        icon: Landmark,
    },
    {
        handle: "alex.arte",
        displayName: "Alex · Creativo",
        facet: "Artístico",
        initials: "AR",
        accentClass: "from-[#39FF14]/70 to-emerald-500/50",
        icon: Palette,
    },
    {
        handle: "alex.pro",
        displayName: "Alex · Profesional",
        facet: "Profesional",
        initials: "PR",
        accentClass: "from-[#FFBF00]/70 to-[#D4AF37]/50",
        icon: Briefcase,
    },
];

// ── Insignia de faceta ─────────────────────────────────────────────────────────
const FACET_COLORS: Record<string, string> = {
    Personal: "bg-primary/15 text-primary border-primary/30",
    Cívico: "bg-[#007FFF]/15 text-[#007FFF] border-[#007FFF]/30",
    Artístico: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    Profesional: "bg-[#FFBF00]/15 text-[#FFBF00] border-[#FFBF00]/30",
    Comunitario: "bg-violet-500/15 text-violet-400 border-violet-500/30",
};

// ── Avatar de iniciales ────────────────────────────────────────────────────────
function ProfileAvatar({
    profile,
    size = "md",
    active = false,
}: {
    profile: ProfileFacet;
    size?: "sm" | "md" | "lg";
    active?: boolean;
}) {
    const Icon = profile.icon;
    const sizeMap = {
        sm: "w-7 h-7 text-[10px]",
        md: "w-9 h-9 text-xs",
        lg: "w-12 h-12 text-sm",
    };
    return (
        <div className="relative shrink-0">
            {active && (
                <span className="absolute -inset-0.5 rounded-full bg-gradient-to-tr from-primary/60 to-accent/60 blur-sm z-0" />
            )}
            <div
                className={cn(
                    "relative z-10 rounded-full flex items-center justify-center font-bold bg-gradient-to-br border border-white/10",
                    sizeMap[size],
                    profile.accentClass,
                    active && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                )}
            >
                {profile.initials}
            </div>
        </div>
    );
}

// ── Componente principal ───────────────────────────────────────────────────────
export function ProfileSwitcher() {
    const { user, profile } = useAccount();

    // Perfil activo almacenado localmente (no modifica el contexto compartido)
    const storageKey = "starseed_active_profile_handle";
    const getInitialHandle = (): string => {
        if (typeof window !== "undefined") {
            return localStorage.getItem(storageKey) ?? DEMO_PROFILES[0].handle;
        }
        return DEMO_PROFILES[0].handle;
    };

    const [activeHandle, setActiveHandle] = useState<string>(getInitialHandle);

    const handleSelect = (handle: string) => {
        setActiveHandle(handle);
        if (typeof window !== "undefined") {
            localStorage.setItem(storageKey, handle);
        }
    };

    const activeProfile = DEMO_PROFILES.find((p) => p.handle === activeHandle) ?? DEMO_PROFILES[0];
    const ActiveIcon = activeProfile.icon;

    // Nombre de cuenta soberana (desde sesión real si disponible)
    const accountName =
        profile?.display_name ??
        profile?.full_name ??
        profile?.username ??
        profile?.handle ??
        user?.email?.split("@")[0] ??
        "Mi Cuenta";

    return (
        <GlassCard intensity="medium" className="p-4 space-y-4">
            {/* ── Encabezado: Cuenta soberana ──────────────────────────── */}
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

            <div className="flex items-center gap-3 px-1">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/50 to-accent/50 flex items-center justify-center text-xs font-bold border border-white/10 shrink-0">
                    {accountName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight truncate">{accountName}</p>
                    <p className="text-[11px] text-muted-foreground leading-tight truncate">
                        {user?.email ?? "identidad@starseed.red"}
                    </p>
                </div>
            </div>

            {/* ── Divisor ─────────────────────────────────────────────── */}
            <div className="border-t border-white/8 pt-3 space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Perfiles activos
                    </span>
                    <button
                        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                        title="Crear nuevo perfil"
                    >
                        <Plus className="w-3 h-3" />
                        Nuevo
                    </button>
                </div>

                {/* ── Lista de perfiles ──────────────────────────────── */}
                <div className="space-y-1">
                    {DEMO_PROFILES.map((p) => {
                        const PIcon = p.icon;
                        const isActive = p.handle === activeHandle;
                        return (
                            <div
                                key={p.handle}
                                onClick={() => handleSelect(p.handle)}
                                className={cn(
                                    "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 group",
                                    isActive
                                        ? "bg-primary/10 border border-primary/25 shadow-inner"
                                        : "hover:bg-white/5 border border-transparent hover:border-white/10",
                                )}
                            >
                                <ProfileAvatar profile={p} size="sm" active={isActive} />

                                <div className="flex-1 min-w-0">
                                    <p className={cn("text-sm font-medium leading-tight truncate", isActive && "text-primary")}>
                                        {p.displayName}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground leading-tight truncate">
                                        @{p.handle}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border font-medium", FACET_COLORS[p.facet])}>
                                        {p.facet}
                                    </span>
                                    {isActive ? (
                                        <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                                    ) : (
                                        <Link
                                            href={`/profile/${p.handle}`}
                                            onClick={(e) => e.stopPropagation()}
                                            className="opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity cursor-pointer"
                                            title={`Ver perfil @${p.handle}`}
                                        >
                                            <ExternalLink className="w-3 h-3" />
                                        </Link>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Acceso rápido al perfil activo ─────────────────────── */}
            <div className="flex gap-2 pt-1">
                <Link
                    href={`/profile/${activeHandle}`}
                    className="flex-1 cursor-pointer"
                >
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-2 border-white/10 bg-white/5 hover:bg-white/10 text-xs cursor-pointer"
                    >
                        <ActiveIcon className="w-3.5 h-3.5" />
                        Ver perfil activo
                        <ExternalLink className="w-3 h-3 ml-auto opacity-60" />
                    </Button>
                </Link>
            </div>
        </GlassCard>
    );
}
