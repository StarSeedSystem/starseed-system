'use client';

import { useState, useCallback } from "react";
import Link from "next/link";
import {
    ShieldCheck, ChevronRight, KeyRound, Fingerprint, Eye, Globe, Lock, X, type LucideIcon,
} from "lucide-react";
import { WidgetShell, MiniList, Chip, ProgressRing } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { IdentityProfile } from "@/lib/widget-data";

// ════════════════════════════════════════════════════════════════
// IdentityVaultWidget — Bóveda de Identidad Soberana.
// Dualidad Cuenta/Perfil: una cuenta raíz verificada (ZK) sostiene
// múltiples perfiles públicos. Accesos a datos siempre revocables.
// Datos "system.identity". Adaptativo. Invariante: soberanía de datos.
// ════════════════════════════════════════════════════════════════
const VIS_META: Record<IdentityProfile["visibility"], { icon: LucideIcon; color: string; label: string }> = {
    publico: { icon: Globe, color: "#34d399", label: "Público" },
    red: { icon: Eye, color: "#38bdf8", label: "Red" },
    privado: { icon: Lock, color: "#a855f7", label: "Privado" },
};

export function IdentityVaultWidget() {
    const { data, loading } = useWidgetData("system.identity", { refreshMs: 30000 });
    const [revoked, setRevoked] = useState<Record<string, boolean>>({});
    const revoke = useCallback((id: string) => setRevoked((p) => ({ ...p, [id]: true })), []);

    return (
        <WidgetShell
            title="Bóveda de Identidad"
            subtitle="Soberanía de tus datos"
            icon={ShieldCheck}
            accent="#8b5cf6"
            actions={
                <Link href="/settings?tab=privacy" className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 hover:text-primary transition-colors cursor-pointer">
                    Privacidad <ChevronRight className="size-3" />
                </Link>
            }
        >
            {(size) => {
                if (loading && !data) return <div className="h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const d = data!;
                const micro = size.tier === "micro" || size.vTier === "micro";
                const shares = d.dataShares.filter((s) => !revoked[s.id]);

                if (micro) {
                    return (
                        <div className="h-full grid place-items-center">
                            <ProgressRing value={d.sovereigntyScore} size={68} color="#8b5cf6" sublabel="soberanía" />
                        </div>
                    );
                }

                return (
                    <div className="flex flex-col gap-2 pt-1 h-full">
                        <div className="flex items-center gap-3 shrink-0">
                            <ProgressRing value={d.sovereigntyScore} size={58} color="#8b5cf6" sublabel="soberanía" />
                            <div className="flex-1 space-y-1">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300"><Fingerprint className="size-3" /> Cuenta verificada (ZK)</span>
                                <span className="block text-[9px] text-muted-foreground/60">{d.zkVerifications} pruebas de conocimiento cero</span>
                                <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${d.keysHealthy ? "text-sky-300" : "text-rose-300"}`}>
                                    <KeyRound className="size-3" /> Claves {d.keysHealthy ? "sanas" : "revisar"}
                                </span>
                            </div>
                        </div>

                        <div className="shrink-0 flex flex-wrap items-center gap-1">
                            {d.profiles.map((p) => {
                                const meta = VIS_META[p.visibility];
                                const VIcon = meta.icon;
                                return (
                                    <span key={p.id} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold"
                                        style={{ color: p.accent, borderColor: `color-mix(in srgb, ${p.accent} 35%, transparent)` }}>
                                        <VIcon className="size-2.5" /> {p.label}
                                    </span>
                                );
                            })}
                        </div>

                        <div className="flex-1 min-h-0">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60">Accesos a tus datos</span>
                            <div className="mt-1">
                                <MiniList
                                    items={shares}
                                    max={size.vTier === "expanded" ? 4 : 2}
                                    empty="No has compartido datos"
                                    render={(s) => (
                                        <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-white/[0.02] px-2 py-1.5">
                                            <div className="min-w-0 flex-1">
                                                <span className="text-[10px] font-bold truncate block">{s.party}</span>
                                                <span className="text-[9px] text-muted-foreground/60 truncate block">{s.scope}</span>
                                            </div>
                                            <button onClick={() => revoke(s.id)}
                                                className="shrink-0 inline-flex items-center gap-1 rounded-md border border-rose-500/30 text-rose-300 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide hover:bg-rose-500/15 transition-colors cursor-pointer">
                                                <X className="size-2.5" /> Revocar
                                            </button>
                                        </div>
                                    )}
                                />
                            </div>
                        </div>
                    </div>
                );
            }}
        </WidgetShell>
    );
}
