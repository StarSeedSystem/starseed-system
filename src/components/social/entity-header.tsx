"use client";

import React, { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, UserPlus, Check, Plus, Pencil, Settings2, Lock } from "lucide-react";
import { ShareButton } from "@/components/social/SocialActions";
import Link from "next/link";

interface EntityHeaderProps {
    entity: {
        id: string;
        kind: string;
        slug: string;
        name: string;
        description: string;
        coverUrl: string;
        avatarUrl?: string; // Algunas entidades pueden tener avatar, si no, iniciales
        memberCount: number;
        accent?: string;
    };
    isOwner: boolean;
    isCommunity: boolean;
    onEdit?: () => void;
    onCustomize?: () => void;
    // Props de seguimiento
    followState: {
        active: boolean;
        loading: boolean;
        needsAuth: boolean;
        toggle: () => Promise<{ ok: boolean; needsAuth?: boolean }>;
    };
}

/** Iniciales reales del nombre */
function initialsOf(name: string): string {
    const parts = (name || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    return parts.slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("");
}

export function EntityHeader({ entity, isOwner, isCommunity, onEdit, onCustomize, followState }: EntityHeaderProps) {
    const accent = entity.accent || "#E9C46A";
    const [hint, setHint] = useState(false);

    const FollowIcon = followState.active ? Check : isCommunity ? Plus : UserPlus;
    const followLabel = followState.active
        ? isCommunity
            ? "Miembro"
            : "Siguiendo"
        : isCommunity
          ? "Unirme"
          : "Seguir";
    // Defensa (Adenda 76 · G3): recuento crudo/legacy puede llegar null/NaN;
    // lo reducimos a 0 para que `.toLocaleString()` nunca lance ni muestre "NaN".
    const safeMemberCount =
        typeof entity.memberCount === "number" && Number.isFinite(entity.memberCount)
            ? entity.memberCount
            : 0;
    const displayCount = safeMemberCount + (followState.active ? 1 : 0);

    const handleFollowClick = async () => {
        const res = await followState.toggle();
        if (res.needsAuth) {
            setHint(true);
            setTimeout(() => setHint(false), 4000);
        }
    };

    return (
        <div className="relative w-full rounded-3xl overflow-hidden border border-white/10 shadow-2xl group pb-6 bg-background/50 backdrop-blur-md">
            {/* Holographic Background Layer */}
            <div className="absolute inset-0 z-0">
                {entity.coverUrl ? (
                    <img
                        src={entity.coverUrl}
                        alt=""
                        className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-700"
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                        }}
                    />
                ) : (
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(0,127,255,0.18),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(168,85,247,0.14),transparent_55%)]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/60 to-background/95" />
                <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-secondary/10 opacity-30 mix-blend-overlay" />
            </div>

            {/* Content Layer */}
            <div className="relative z-10 flex min-w-0 flex-col gap-[clamp(0.75rem,3vw,1.5rem)] px-[clamp(0.875rem,4vw,2rem)] pt-[clamp(4rem,16vw,8rem)] sm:flex-row sm:items-end">
                {/* Avatar */}
                <div className="relative shrink-0">
                    <div className="h-[clamp(4.5rem,18vw,8rem)] w-[clamp(4.5rem,18vw,8rem)] rounded-full bg-gradient-to-br from-white/50 to-white/10 p-1 shadow-2xl ring-1 ring-white/30 backdrop-blur-xl">
                        <Avatar className="h-full w-full rounded-full border-2 border-transparent">
                            <AvatarImage
                                src={entity.avatarUrl}
                                className="object-cover"
                            />
                            <AvatarFallback className="bg-background/50 text-[clamp(1.1rem,5vw,1.5rem)] font-bold backdrop-blur">
                                {initialsOf(entity.name)}
                            </AvatarFallback>
                        </Avatar>
                    </div>
                </div>

                {/* Info Array */}
                <div className="min-w-0 flex-1 pb-2">
                    <Badge
                        variant="outline"
                        className="mb-1.5 max-w-full border-primary/20 bg-primary/10 text-[10px] text-primary backdrop-blur-sm sm:text-xs capitalize"
                    >
                        <span className="truncate">{entity.kind}</span>
                    </Badge>

                    <h1 className="font-headline text-[clamp(1.35rem,6vw,2.25rem)] font-bold leading-tight tracking-tight text-foreground drop-shadow-sm [overflow-wrap:anywhere]">
                        {entity.name}
                    </h1>
                    <p className="mb-3 flex items-center gap-1.5 truncate font-mono text-[clamp(0.8rem,3.2vw,1.125rem)] font-medium text-muted-foreground/80">
                        <Users className="h-4 w-4" />
                        {displayCount.toLocaleString("es-ES")} miembros
                    </p>

                    {entity.description && (
                        <p className="max-w-2xl text-[clamp(0.85rem,2.5vw,1rem)] leading-relaxed text-foreground/90 [overflow-wrap:anywhere] line-clamp-4 sm:line-clamp-none">
                            {entity.description}
                        </p>
                    )}
                </div>

                {/* Actions */}
                <div className="relative shrink-0 pb-2 flex flex-col gap-2 items-end">
                    <div className="flex flex-wrap items-center gap-2 justify-end">
                        {isOwner && onEdit && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onEdit}
                                className="gap-2 cursor-pointer"
                                style={{ borderColor: `${accent}55`, color: accent }}
                            >
                                <Pencil className="h-4 w-4" />
                                Editar
                            </Button>
                        )}
                        {isOwner && onCustomize && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={onCustomize}
                                className="gap-2 cursor-pointer"
                                style={{ borderColor: `${accent}55`, color: accent }}
                            >
                                <Settings2 className="h-4 w-4" />
                                Personalizar
                            </Button>
                        )}
                        <ShareButton title={entity.name} accent={accent} />
                        <Button
                            type="button"
                            variant={followState.active ? "outline" : "default"}
                            onClick={handleFollowClick}
                            disabled={followState.loading}
                            className="gap-2 cursor-pointer transition-all"
                            style={
                                followState.active
                                    ? { borderColor: `${accent}88`, color: accent }
                                    : { background: accent, color: "#0b0b12", borderColor: accent }
                            }
                        >
                            <FollowIcon className="h-4 w-4" />
                            <span>{followLabel}</span>
                        </Button>
                    </div>
                    {(hint || (followState.needsAuth && followState.active === false)) && hint && (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1">
                            <Lock className="h-3 w-3" />
                            <Link href="/login" className="underline cursor-pointer" style={{ color: accent }}>
                                Inicia sesión para {isCommunity ? "unirte" : "seguir"}
                            </Link>
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
