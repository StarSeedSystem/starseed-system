"use client";

/*
 * GroupFacePicker — selector compacto de la FACETA con la que el usuario
 * participa en UN grupo concreto (dualidad Cuenta/Perfil, CLAUDE.md §6;
 * Adenda 125).
 *
 * PURA PRESENTACIÓN: cambia con qué cara pública (os_account_profiles) se muestra
 * el ciudadano dentro del grupo. NO toca la membresía ni el censo "una persona,
 * un voto" (eso vive en os_memberships, keyed por cuenta, y no se altera).
 *
 * No renderiza NADA si no hay sesión o si la cuenta tiene ≤1 faceta (no hay
 * elección que ofrecer). Estilo Crystal/Glass como AccountProfilesSwitcher.
 *
 * Montaje sugerido: cabecera de src/app/(app)/grupo/[slug]/page.tsx.
 */

import { useMemo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronsUpDown, Check, Star, Users2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { profileKindLabel, type AccountProfile } from "@/lib/profiles/profiles";
import { useGroupFace } from "@/lib/profiles/group-faces";

function initialsOf(label: string): string {
    const parts = (label || "").trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "SS";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

export interface GroupFacePickerProps {
    groupSlug: string;
    className?: string;
}

export function GroupFacePicker({ groupSlug, className }: GroupFacePickerProps) {
    const { face, profiles, loading, setFace } = useGroupFace(groupSlug);

    // Faceta activa efectiva: la elegida → la predeterminada → la primera.
    const current: AccountProfile | null = useMemo(() => {
        if (profiles.length === 0) return null;
        return (
            profiles.find((p) => p.id === face) ??
            profiles.find((p) => p.isDefault) ??
            profiles[0]
        );
    }, [profiles, face]);

    // Nada que mostrar mientras carga, sin sesión (0 facetas) o con una sola
    // faceta (no hay elección posible). Cubre el requisito "≤1 perfil → nada".
    if (loading || profiles.length <= 1) return null;

    return (
        <div className={cn("w-full", className)}>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                ¿Con qué perfil participas aquí?
            </p>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        className="flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left transition-colors hover:bg-white/[0.06] cursor-pointer"
                    >
                        <Avatar className="h-8 w-8 shrink-0 border border-white/10">
                            {current?.avatarUrl ? (
                                <AvatarImage src={current.avatarUrl} alt={current.name} />
                            ) : null}
                            <AvatarFallback className="bg-gradient-to-br from-primary/50 to-accent/50 text-[11px] font-bold">
                                {initialsOf(current?.name ?? "")}
                            </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold leading-tight">
                                {current?.name ?? "Perfil"}
                            </p>
                            <p className="truncate text-[10px] leading-tight text-muted-foreground">
                                {profileKindLabel(current?.kind ?? "personal")}
                                {current?.handle ? ` · @${current.handle}` : ""}
                            </p>
                        </div>
                        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="start"
                    className="w-72 border-white/10 bg-black/85 backdrop-blur-xl"
                >
                    <DropdownMenuLabel className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                        <Users2 className="h-3 w-3" /> Tu cara en este grupo
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-white/5" />
                    {profiles.map((p) => {
                        const active = p.id === current?.id;
                        return (
                            <DropdownMenuItem
                                key={p.id}
                                className={cn(
                                    "flex items-center gap-2.5 cursor-pointer py-2",
                                    active && "bg-primary/10",
                                )}
                                onSelect={(e) => {
                                    e.preventDefault();
                                    if (p.id !== face) void setFace(p.id);
                                }}
                            >
                                <Avatar className="h-7 w-7 shrink-0 border border-white/10">
                                    {p.avatarUrl ? <AvatarImage src={p.avatarUrl} alt={p.name} /> : null}
                                    <AvatarFallback className="bg-gradient-to-br from-primary/40 to-accent/40 text-[10px] font-bold">
                                        {initialsOf(p.name)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-semibold">{p.name}</p>
                                    <p className="truncate text-[10px] text-muted-foreground">
                                        {profileKindLabel(p.kind)}
                                        {p.handle ? ` · @${p.handle}` : ""}
                                    </p>
                                </div>
                                {p.isDefault && (
                                    <Star className="h-3 w-3 shrink-0 fill-amber-300 text-amber-300" />
                                )}
                                {active && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                            </DropdownMenuItem>
                        );
                    })}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}

export default GroupFacePicker;
