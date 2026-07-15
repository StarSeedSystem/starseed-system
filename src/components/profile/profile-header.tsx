"use client";

import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import { ProfileStatsBlocks } from "./profile-stats-blocks";

interface ProfileHeaderProps {
    profileData: {
        user_id?: string;
        profile_id?: string;
        name: string;
        handle: string;
        bio: string;
        avatar: string;
        cover: string;
        coverHint?: string;
        dataAiHint?: string;
        isUser?: boolean;
        pageType?: string;
    };
}

/** Iniciales reales del nombre (una o dos letras), sin placeholders. */
function initialsOf(name: string): string {
    const parts = (name || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    return parts
        .slice(0, 2)
        .map((w) => w.charAt(0).toUpperCase())
        .join("");
}

export function ProfileHeader({ profileData }: ProfileHeaderProps) {
    const isOwner = !!profileData.isUser;

    return (
        <div className="relative w-full rounded-3xl overflow-hidden border border-white/10 shadow-2xl group pb-6 bg-background/50 backdrop-blur-md">
            {/* Holographic Background Layer — portada REAL o gradiente honesto */}
            <div className="absolute inset-0 z-0">
                {profileData.cover ? (
                    <img
                        src={profileData.cover}
                        alt=""
                        className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-700"
                        data-ai-hint={profileData.coverHint}
                        onError={(e) => {
                            // Si falla la imagen (CORS, 404, etc), ocultarla para que se vea el gradiente de fallback.
                            e.currentTarget.style.display = 'none';
                        }}
                    />
                ) : (
                    // Sin portada: aurora sutil de sistema (decoración, no dato falso).
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(0,127,255,0.18),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(168,85,247,0.14),transparent_55%)]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/60 to-background/95" />
                <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-secondary/10 opacity-30 mix-blend-overlay" />
            </div>

            {/* Content Layer
                Estructura responsive (Adenda 68 §C):
                  · Móvil  → columna: avatar + identidad + bloques, todo a lo ancho.
                  · ≥sm    → avatar y texto en fila; el texto SIEMPRE con `min-w-0`
                             (si no, un nombre o un handle largo estiraría el flex
                             y desbordaría la tarjeta).
                Ya NO hay "Action Matrix" aquí: Seguir / Editar / Compartir / Mensaje
                viven —reales y funcionando— en `ProfileQuickActions`, justo debajo.
                Antes se duplicaban, y encima los botones Compartir y Guardar de esta
                cabecera NO hacían nada (no tenían onClick): eran decoración. */}
            <div className="relative z-10 flex min-w-0 flex-col gap-[clamp(0.75rem,3vw,1.5rem)] px-[clamp(0.875rem,4vw,2rem)] pt-[clamp(4rem,16vw,8rem)] sm:flex-row sm:items-end">
                {/* Identity Core (Avatar) — imagen real o iniciales */}
                <div className="relative shrink-0">
                    <div className="h-[clamp(4.5rem,18vw,8rem)] w-[clamp(4.5rem,18vw,8rem)] rounded-full bg-gradient-to-br from-white/50 to-white/10 p-1 shadow-2xl ring-1 ring-white/30 backdrop-blur-xl">
                        <Avatar className="h-full w-full rounded-full border-2 border-transparent">
                            <AvatarImage
                                src={profileData.avatar || undefined}
                                className="object-cover"
                                data-ai-hint={profileData.dataAiHint}
                            />
                            <AvatarFallback className="bg-background/50 text-[clamp(1.1rem,5vw,1.5rem)] font-bold backdrop-blur">
                                {initialsOf(profileData.name)}
                            </AvatarFallback>
                        </Avatar>
                    </div>
                </div>

                {/* Info Array — `min-w-0` es lo que permite truncar/envolver aquí dentro. */}
                <div className="min-w-0 flex-1 pb-2">
                    <Badge
                        variant="outline"
                        className="mb-1.5 max-w-full border-primary/20 bg-primary/10 text-[10px] text-primary backdrop-blur-sm sm:text-xs"
                    >
                        <span className="truncate">
                            {profileData.pageType && profileData.pageType !== "personal"
                                ? profileData.pageType.charAt(0).toUpperCase() + profileData.pageType.slice(1)
                                : "Ciudadano Soberano"}
                        </span>
                    </Badge>

                    <h1 className="font-headline text-[clamp(1.35rem,6vw,2.25rem)] font-bold leading-tight tracking-tight text-foreground drop-shadow-sm [overflow-wrap:anywhere]">
                        {profileData.name}
                    </h1>
                    <p className="mb-3 truncate font-mono text-[clamp(0.8rem,3.2vw,1.125rem)] font-medium text-muted-foreground/80">
                        {profileData.handle}
                    </p>

                    {profileData.bio && (
                        // `line-clamp-4` + `[overflow-wrap:anywhere]`: una bio larga (o una
                        // URL sin espacios) envuelve y se recorta con elegancia en vez de
                        // estirar la tarjeta. Sin bio → no se pinta nada (vacío honesto).
                        <p className="max-w-2xl text-[clamp(0.85rem,2.5vw,1rem)] leading-relaxed text-foreground/90 [overflow-wrap:anywhere] line-clamp-4 sm:line-clamp-none">
                            {profileData.bio}
                        </p>
                    )}

                    {/* Display principal: bloques reales y configurables (sustituye a
                        las antiguas métricas inventadas Reputación / Nodos / Impacto). */}
                    <ProfileStatsBlocks handle={profileData.handle} isOwner={isOwner} userId={profileData.user_id} profileId={profileData.profile_id} />
                </div>
            </div>
        </div>
    );
}
