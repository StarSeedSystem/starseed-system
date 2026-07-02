"use client";
import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Rss, Edit, Bookmark, Share2 } from "lucide-react";
import Image from "next/image";
import { ProfileStatsBlocks } from "./profile-stats-blocks";

interface ProfileHeaderProps {
    profileData: {
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
                    <Image
                        src={profileData.cover}
                        alt="Cover"
                        fill
                        className="object-cover opacity-80 group-hover:scale-105 transition-transform duration-700"
                        priority
                        data-ai-hint={profileData.coverHint}
                    />
                ) : (
                    // Sin portada: aurora sutil de sistema (decoración, no dato falso).
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(0,127,255,0.18),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(168,85,247,0.14),transparent_55%)]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/60 to-background/95" />
                <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-secondary/10 opacity-30 mix-blend-overlay" />
            </div>

            {/* Content Layer */}
            <div className="relative z-10 px-[clamp(1rem,4vw,2rem)] pt-[clamp(5rem,18vw,8rem)] flex flex-col md:flex-row items-start md:items-end gap-[clamp(1rem,3vw,1.5rem)]">
                {/* Identity Core (Avatar) — imagen real o iniciales */}
                <div className="relative shrink-0">
                    <div className="h-[clamp(5rem,20vw,8rem)] w-[clamp(5rem,20vw,8rem)] rounded-full p-1 bg-gradient-to-br from-white/50 to-white/10 backdrop-blur-xl shadow-2xl ring-1 ring-white/30">
                        <Avatar className="h-full w-full rounded-full border-2 border-transparent">
                            <AvatarImage
                                src={profileData.avatar || undefined}
                                className="object-cover"
                                data-ai-hint={profileData.dataAiHint}
                            />
                            <AvatarFallback className="text-[clamp(1.1rem,5vw,1.5rem)] font-bold bg-background/50 backdrop-blur">
                                {initialsOf(profileData.name)}
                            </AvatarFallback>
                        </Avatar>
                    </div>
                </div>

                {/* Info Array */}
                <div className="flex-1 min-w-0 pb-2 w-full">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 backdrop-blur-sm text-[10px] sm:text-xs">
                            {profileData.pageType && profileData.pageType !== "personal"
                                ? profileData.pageType.charAt(0).toUpperCase() + profileData.pageType.slice(1)
                                : "Ciudadano Soberano"}
                        </Badge>
                    </div>

                    <h1 className="text-[clamp(1.5rem,6vw,2.25rem)] font-bold font-headline tracking-tight text-foreground drop-shadow-sm break-words">
                        {profileData.name}
                    </h1>
                    <p className="text-[clamp(0.9rem,3.5vw,1.125rem)] font-medium text-muted-foreground/80 mb-4 font-mono truncate">
                        {profileData.handle}
                    </p>

                    {profileData.bio && (
                        <p className="max-w-2xl text-[clamp(0.875rem,2.5vw,1rem)] text-foreground/90 leading-relaxed backdrop-blur-sm rounded-lg break-words">
                            {profileData.bio}
                        </p>
                    )}

                    {/* Display principal: bloques reales y configurables (sustituye a
                        las antiguas métricas inventadas Reputación / Nodos / Impacto). */}
                    <ProfileStatsBlocks handle={profileData.handle} isOwner={isOwner} />
                </div>

                {/* Action Matrix */}
                <div className="flex flex-wrap sm:flex-nowrap md:flex-col lg:flex-row gap-3 md:mb-2 w-full md:w-auto mt-4 md:mt-0">
                    {!isOwner && (
                        <Button size="lg" className="flex-1 sm:flex-none cursor-pointer shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-shadow gap-2">
                            <Rss className="h-4 w-4" /> Seguir
                        </Button>
                    )}
                    {isOwner && (
                        <Button variant="outline" size="lg" className="flex-1 sm:flex-none cursor-pointer backdrop-blur-md bg-background/30 border-white/10 hover:bg-background/50 gap-2">
                            <Edit className="h-4 w-4" /> Editar
                        </Button>
                    )}
                    <div className="flex gap-2 shrink-0">
                        <Button variant="ghost" size="icon" aria-label="Compartir perfil" className="h-10 w-10 cursor-pointer rounded-full hover:bg-white/10">
                            <Share2 className="h-5 w-5" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Guardar perfil" className="h-10 w-10 cursor-pointer rounded-full hover:bg-white/10">
                            <Bookmark className="h-5 w-5" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
