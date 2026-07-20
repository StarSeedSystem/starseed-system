"use client";

/**
 * ── PresenceRow — «En la red ahora» (presencia en vivo) ──────────────────────
 * Fila superior con avatares reales de las conexiones activas (co-membresía),
 * pulso suave y opt-out de privacidad. Canal Supabase Presence `hub:presence`.
 */

import React, { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Radio, Eye, EyeOff, Users } from "lucide-react";
import {
    useHubPresence, getPresenceOptOut, setPresenceOptOut, PRESENCE_OPTOUT_EVENT,
} from "@/lib/hub-social/presence";
import type { ActiveProfileLite } from "@/lib/hub-social/graph";

function initials(name: string): string {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "S";
}

export function PresenceRow({
    profile, myGroupSlugs, needsAuth,
}: {
    profile: ActiveProfileLite | null; myGroupSlugs: string[]; needsAuth: boolean;
}) {
    const [optOut, setOptOut] = useState(false);

    useEffect(() => {
        setOptOut(getPresenceOptOut());
        const on = () => setOptOut(getPresenceOptOut());
        window.addEventListener(PRESENCE_OPTOUT_EVENT, on);
        return () => window.removeEventListener(PRESENCE_OPTOUT_EVENT, on);
    }, []);

    const { connections, totalPresent, tracking } = useHubPresence(profile, myGroupSlugs, optOut);

    const toggle = () => {
        const next = !optOut;
        setOptOut(next);
        setPresenceOptOut(next);
    };

    const shown = connections.slice(0, 7);
    const extra = Math.max(0, connections.length - shown.length);

    return (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.015] px-4 py-3 shadow-inner">
            <div className="inline-flex shrink-0 items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                    {tracking && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-70" aria-hidden />}
                    <span className={cn("relative inline-flex h-2 w-2 rounded-full", tracking ? "bg-emerald-300" : "bg-white/30")} aria-hidden />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-foreground/80">En la red ahora</span>
            </div>

            <div className="flex min-w-0 flex-1 items-center gap-2">
                {needsAuth ? (
                    <span className="text-xs text-muted-foreground">Inicia sesión para ver a tus conexiones en vivo.</span>
                ) : optOut ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <EyeOff className="h-3.5 w-3.5" /> Modo privado: no apareces en la red.
                    </span>
                ) : connections.length === 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Radio className="h-3.5 w-3.5" />
                        Ninguna de tus conexiones está aquí ahora mismo
                        {totalPresent > 1 ? ` · ${totalPresent} ciudadanos en la red` : ""}.
                    </span>
                ) : (
                    <div className="flex items-center gap-2">
                        <div className="flex -space-x-2">
                            {shown.map((p) => (
                                <span
                                    key={p.key}
                                    title={p.sharedGroups.length ? `${p.name} · contigo en ${p.sharedGroups.length} grupo${p.sharedGroups.length === 1 ? "" : "s"}` : p.name}
                                    className="inline-block"
                                >
                                    <Avatar className="h-8 w-8 border-2 border-background ring-1 ring-emerald-400/30">
                                        {p.avatar ? <AvatarImage src={p.avatar} alt={p.name} /> : null}
                                        <AvatarFallback className="bg-emerald-500/20 text-[10px] font-bold text-emerald-200">
                                            {initials(p.name)}
                                        </AvatarFallback>
                                    </Avatar>
                                </span>
                            ))}
                            {extra > 0 && (
                                <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-background bg-white/[0.06] text-[10px] font-bold text-foreground/70">
                                    +{extra}
                                </span>
                            )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                            {connections.length} {connections.length === 1 ? "conexión activa" : "conexiones activas"}
                        </span>
                    </div>
                )}
            </div>

            {!needsAuth && (
                <button
                    type="button"
                    onClick={toggle}
                    aria-pressed={!optOut}
                    aria-label={optOut ? "Aparecer en la red" : "Ocultarme (modo privado)"}
                    title={optOut ? "Aparecer en la red" : "Ocultarme (modo privado)"}
                    className={cn(
                        "inline-flex min-h-[2.75rem] shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:min-h-[2.25rem]",
                        optOut
                            ? "border-white/12 bg-white/[0.04] text-muted-foreground hover:text-foreground"
                            : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/15",
                    )}
                >
                    {optOut ? <><Eye className="h-3.5 w-3.5" /> Aparecer</> : <><Users className="h-3.5 w-3.5" /> Visible</>}
                </button>
            )}
        </div>
    );
}

export default PresenceRow;
