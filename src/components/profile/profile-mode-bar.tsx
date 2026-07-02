'use client';

// ════════════════════════════════════════════════════════════════
// ProfileModeBar — selector de modo de la página de perfil
// ----------------------------------------------------------------
// Tres modos: Clásico (pestañas actuales) · Libre (bloques
// reordenables/ocultables) · VR/AR (espacio inmersivo WebXR).
// Segmented control glass, adaptativo a pantallas pequeñas.
// La elección se persiste por handle (profile-display-store).
// ════════════════════════════════════════════════════════════════

import React from "react";
import { LayoutList, LayoutDashboard, Boxes, type LucideIcon } from "lucide-react";
import type { ProfileViewMode } from "./profile-display-store";

const MODES: { id: ProfileViewMode; label: string; icon: LucideIcon; hint: string }[] = [
    { id: "clasico", label: "Clásico", icon: LayoutList, hint: "Vista clásica con pestañas" },
    { id: "libre", label: "Libre", icon: LayoutDashboard, hint: "Página libre: bloques reordenables" },
    { id: "vr", label: "VR / AR", icon: Boxes, hint: "Espacio inmersivo WebXR" },
];

interface ProfileModeBarProps {
    mode: ProfileViewMode;
    onChange: (mode: ProfileViewMode) => void;
}

export function ProfileModeBar({ mode, onChange }: ProfileModeBarProps) {
    return (
        <div
            role="tablist"
            aria-label="Modo de la página de perfil"
            className="flex w-full items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur-md sm:w-auto sm:self-center"
        >
            {MODES.map(({ id, label, icon: Icon, hint }) => {
                const active = mode === id;
                return (
                    <button
                        key={id}
                        role="tab"
                        aria-selected={active}
                        title={hint}
                        onClick={() => onChange(id)}
                        className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors duration-200 sm:flex-none sm:px-4 sm:text-sm ${
                            active
                                ? "bg-white/10 text-foreground shadow-inner ring-1 ring-white/15"
                                : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                        }`}
                    >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{label}</span>
                    </button>
                );
            })}
        </div>
    );
}
