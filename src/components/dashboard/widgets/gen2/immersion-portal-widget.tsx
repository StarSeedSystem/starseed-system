'use client';

import { motion } from "framer-motion";
import { Orbit, Users, Glasses, Boxes, Monitor } from "lucide-react";
import { WidgetShell, MiniList, Chip } from "../../kit";
import { useWidgetData } from "@/lib/widget-data";
import type { ImmersiveWorld } from "@/lib/widget-data/types";

const modeIcon = { vr: Glasses, ar: Boxes, "2d": Monitor } as const;

export function ImmersionPortalWidget() {
    const { data, loading } = useWidgetData("entertainment.worlds", { refreshMs: 7000 });

    return (
        <WidgetShell title="Portales de Inmersión" subtitle="Multiverso" icon={Orbit} accent="#f472b6" live>
            {(size) => {
                if (loading || !data) return <div className="pt-2 h-full rounded-2xl bg-muted/15 animate-pulse" />;
                const cols = size.tier === "expanded" ? 2 : 1;
                const max = size.vTier === "micro" ? 2 : size.vTier === "compact" ? 2 : cols === 2 ? 4 : 4;

                return (
                    <div className={cols === 2 ? "grid grid-cols-2 gap-2 pt-1" : "pt-1"}>
                        {cols === 2 ? (
                            data.slice(0, max).map((w) => <PortalCard key={w.id} world={w} />)
                        ) : (
                            <MiniList items={data} max={max} render={(w: ImmersiveWorld) => <PortalCard world={w} />} />
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}

function PortalCard({ world }: { world: ImmersiveWorld }) {
    const Icon = modeIcon[world.mode];
    return (
        <motion.button whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}
            className="relative w-full text-left rounded-2xl border border-border/40 p-3 overflow-hidden group/portal"
            style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${world.accent} 22%, transparent), color-mix(in srgb, ${world.accent} 6%, transparent))` }}>
            <motion.div className="absolute -right-6 -top-6 size-20 rounded-full blur-2xl opacity-40"
                style={{ background: world.accent }}
                animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.5, 0.3] }} transition={{ duration: 4 + world.intensity * 3, repeat: Infinity }} />
            <div className="relative flex items-center justify-between">
                <Icon className="size-4" style={{ color: world.accent }} />
                <Chip color={world.accent}>{world.mode.toUpperCase()}</Chip>
            </div>
            <h4 className="relative mt-2 text-sm font-black truncate">{world.name}</h4>
            <div className="relative mt-0.5 text-[10px] text-muted-foreground/60 capitalize">{world.genre}</div>
            <div className="relative mt-2 flex items-center gap-1 text-[10px] font-bold" style={{ color: world.accent }}>
                <Users className="size-3" /> {world.activeUsers.toLocaleString()}
            </div>
        </motion.button>
    );
}
