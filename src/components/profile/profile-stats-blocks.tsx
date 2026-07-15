'use client';

// ════════════════════════════════════════════════════════════════
// ProfileStatsBlocks — display principal del perfil (bloques glass)
// ----------------------------------------------------------------
// Sustituye a las antiguas métricas inventadas (Reputación / Nodos /
// Impacto) por bloques RELEVANTES y CONFIGURABLES: Comunidades, E.F.,
// Grupos, Aportaciones, Publicaciones, Enlaces y Archivos.
//
//   • Conteos: useProfileRealCounts (solo datos reales; sin fuente → "—").
//   • Configuración (visibilidad + orden): engranaje → editor, persistido
//     por handle en localStorage 'starseed.profile.display.v1'.
//   • Crystal Liquid Glass: chips translúcidos, adaptativos a pantallas
//     pequeñas (flex-wrap, tipografía clamp), sin emojis como iconos.
// ════════════════════════════════════════════════════════════════

import React from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Landmark,
    Users,
    UsersRound,
    HandHeart,
    FileText,
    Link2,
    FolderOpen,
    Settings2,
    ArrowUp,
    ArrowDown,
    type LucideIcon,
} from "lucide-react";
import {
    useProfileDisplay,
    type ProfileBlockId,
} from "./profile-display-store";
import { useProfileRealCounts } from "./use-profile-real-counts";

// ── Metadatos visuales de cada bloque ────────────────────────────
const BLOCK_META: Record<
    ProfileBlockId,
    { label: string; icon: LucideIcon; accent: string }
> = {
    comunidades: { label: "Comunidades", icon: UsersRound, accent: "text-primary" },
    ef: { label: "E.F.", icon: Landmark, accent: "text-amber-400" },
    grupos: { label: "Grupos", icon: Users, accent: "text-secondary" },
    aportaciones: { label: "Aportaciones", icon: HandHeart, accent: "text-rose-400" },
    publicaciones: { label: "Publicaciones", icon: FileText, accent: "text-sky-400" },
    enlaces: { label: "Enlaces", icon: Link2, accent: "text-emerald-400" },
    archivos: { label: "Archivos", icon: FileText, accent: "text-indigo-400" },
};

interface ProfileStatsBlocksProps {
    /** Handle del perfil (con o sin @); clave de la config persistida. */
    handle: string;
    /** true si quien mira es dueño del perfil (habilita el engranaje). */
    isOwner: boolean;
    userId?: string;
    profileId?: string;
}

export function ProfileStatsBlocks({ handle, isOwner, userId, profileId }: ProfileStatsBlocksProps) {
    const { config, toggleBlock, reorderBlocks } = useProfileDisplay(handle);
    const counts = useProfileRealCounts({ isOwner, linksCount: config.links.length });

    const visibleBlocks = config.blocks.filter((b) => b.visible);

    const move = (id: ProfileBlockId, dir: -1 | 1) => {
        const ids = config.blocks.map((b) => b.id);
        const i = ids.indexOf(id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= ids.length) return;
        const next = [...ids];
        [next[i], next[j]] = [next[j], next[i]];
        reorderBlocks(next);
    };

    return (
        <div className="mt-6 flex flex-wrap items-stretch gap-2">
            {visibleBlocks.map((b) => {
                const meta = BLOCK_META[b.id];
                const count = counts[b.id];
                const Icon = meta.icon;
                return (
                    <div
                        key={b.id}
                        className="flex min-w-[6.5rem] flex-1 flex-col justify-between gap-0.5 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 shadow-sm backdrop-blur-md sm:flex-none sm:min-w-[7.5rem]"
                    >
                        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            <Icon className={`h-3 w-3 shrink-0 ${meta.accent}`} />
                            <span className="truncate">{meta.label}</span>
                        </span>
                        <span
                            className={`font-mono text-[clamp(1rem,4vw,1.25rem)] font-bold leading-tight ${
                                count === null ? "text-muted-foreground/50" : "text-foreground"
                            }`}
                            title={count === null ? "Sin datos reales todavía" : undefined}
                        >
                            {count === null ? "—" : count}
                        </span>
                    </div>
                );
            })}

            {visibleBlocks.length === 0 && (
                <p className="rounded-2xl border border-dashed border-white/12 px-3 py-2 text-xs text-muted-foreground">
                    Todos los bloques están ocultos.
                </p>
            )}

            {isOwner && (
                <Dialog>
                    <DialogTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Configurar bloques del perfil"
                            title="Configurar bloques del perfil"
                            className="h-auto min-h-[3rem] w-10 shrink-0 cursor-pointer self-stretch rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md hover:bg-white/10"
                        >
                            <Settings2 className="h-4 w-4" />
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md border-white/10 bg-background/90 backdrop-blur-xl">
                        <DialogHeader>
                            <DialogTitle className="font-headline">Bloques del display</DialogTitle>
                            <DialogDescription>
                                Elige qué bloques se muestran y en qué orden. Se guarda en este
                                dispositivo para {handle.startsWith("@") ? handle : `@${handle}`}.
                            </DialogDescription>
                        </DialogHeader>
                        <ul className="flex flex-col gap-1">
                            {config.blocks.map((b, i) => {
                                const meta = BLOCK_META[b.id];
                                const Icon = meta.icon;
                                return (
                                    <li
                                        key={b.id}
                                        className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2"
                                    >
                                        <Icon className={`h-4 w-4 shrink-0 ${meta.accent}`} />
                                        <span className="flex-1 truncate text-sm font-medium">{meta.label}</span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 cursor-pointer"
                                            aria-label={`Subir ${meta.label}`}
                                            disabled={i === 0}
                                            onClick={() => move(b.id, -1)}
                                        >
                                            <ArrowUp className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 cursor-pointer"
                                            aria-label={`Bajar ${meta.label}`}
                                            disabled={i === config.blocks.length - 1}
                                            onClick={() => move(b.id, 1)}
                                        >
                                            <ArrowDown className="h-3.5 w-3.5" />
                                        </Button>
                                        <Switch
                                            checked={b.visible}
                                            onCheckedChange={() => toggleBlock(b.id)}
                                            aria-label={`Mostrar ${meta.label}`}
                                            className="cursor-pointer"
                                        />
                                    </li>
                                );
                            })}
                        </ul>
                        <p className="text-xs text-muted-foreground">
                            Los bloques sin fuente de datos real muestran “—” (nunca números
                            inventados).
                        </p>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
