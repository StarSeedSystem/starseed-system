"use client";
import React from "react";
import { Bell, Info, AlertTriangle, CheckCircle, X, ExternalLink, Binary, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useNotifications, type AppNotification } from "@/context/notifications-context";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAstraura158Feed } from "@/lib/astraura/astraura-158-feed";

/** (Ola 3 · Adenda 155) Avisos vivos de los procesos de fondo Astraura 1.58:
 * lo que la imaginación/enjambre/director acaban de emitir por el puente,
 * con deep-link a la pestaña de notificaciones del Studio. */
function Astraura158Strip() {
    const feed = useAstraura158Feed();
    const fresh = feed.events.filter((e) => !e.read && !e.acked).slice(-3).reverse();
    if (!feed.target && !fresh.length) return null;
    return (
        <div className="mx-2 rounded-lg border border-cyan-400/15 bg-cyan-500/[0.05] px-3 py-2">
            <div className="flex items-center gap-2">
                <Binary className="h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-cyan-100/90">
                    Procesos 1.58 {feed.target ? `(${feed.target === "local" ? "neurona" : "nube"})` : ""}
                    {feed.unread > 0 ? ` · ${feed.unread} sin leer` : " · al día"}
                </span>
                <Link href="/agent?tab=astraura-158&sub=notificaciones" className="text-[10px] text-cyan-300/80 underline-offset-2 hover:underline">
                    abrir
                </Link>
            </div>
            {fresh.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                    {fresh.map((e) => (
                        <li key={e.id} className="flex items-start gap-1.5 text-[10px] leading-snug text-white/70">
                            <Zap className="mt-0.5 h-2.5 w-2.5 shrink-0 text-cyan-300/70" aria-hidden="true" />
                            <span className="min-w-0 truncate">{e.title ?? e.message ?? e.id}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export function NotificationsTab() {
    const { inbox, markRead, clearAll, archive } = useNotifications();

    // Limit display to 5 most recent notifications in the panel
    const recentNotifications = React.useMemo(() => {
        return inbox.slice(0, 5);
    }, [inbox]);

    return (
        <div className="flex flex-col h-full space-y-4">
            <div className="px-4 py-2 flex items-center justify-between shrink-0">
                <span className="text-xs font-medium text-muted-foreground">Recientes ({inbox.length})</span>
                {inbox.length > 0 && (
                    <button 
                        onClick={clearAll} 
                        className="text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                        Limpiar Todo
                    </button>
                )}
            </div>

            {/* Procesos de fondo Astraura 1.58 (imaginación · enjambre · director). */}
            <Astraura158Strip />

            <div className="flex-1 px-2 space-y-2 overflow-y-auto max-h-[340px] custom-scrollbar">
                <AnimatePresence mode="popLayout">
                    {recentNotifications.length > 0 ? (
                        recentNotifications.map((notif) => (
                            <NotificationItem 
                                key={notif.id} 
                                data={notif} 
                                onDismiss={() => archive(notif.id)} 
                            />
                        ))
                    ) : (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-2"
                        >
                            <Bell className="w-8 h-8 opacity-20 text-amber-400 animate-bounce" />
                            <span className="text-xs">Sin notificaciones nuevas</span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Bottom Fullscreen Link */}
            <div className="p-3 border-t border-white/5 shrink-0 bg-black/40 backdrop-blur-xl">
                <Button 
                    asChild 
                    className="w-full text-xs gap-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-300"
                >
                    <Link href="/notifications">
                        <ExternalLink className="w-3.5 h-3.5" />
                        Ver Página Completa & Logs
                    </Link>
                </Button>
            </div>
        </div>
    );
}

function NotificationItem({ data, onDismiss }: { data: AppNotification, onDismiss: () => void }) {
    const typeStyles: any = {
        system: { icon: Info, color: "text-blue-400", border: "border-l-blue-500", bg: "hover:bg-blue-500/5" },
        ai: { icon: BotIcon, color: "text-cyan-400", border: "border-l-cyan-500", bg: "hover:bg-cyan-500/5" },
        mention: { icon: Bell, color: "text-pink-400", border: "border-l-pink-500", bg: "hover:bg-pink-500/5" },
        governance: { icon: AlertTriangle, color: "text-red-400", border: "border-l-red-500", bg: "hover:bg-red-500/5" },
        culture: { icon: CheckCircle, color: "text-purple-400", border: "border-l-purple-500", bg: "hover:bg-purple-500/5" },
        education: { icon: CheckCircle, color: "text-emerald-400", border: "border-l-emerald-500", bg: "hover:bg-emerald-500/5" },
        community: { icon: Info, color: "text-indigo-400", border: "border-l-indigo-500", bg: "hover:bg-indigo-500/5" },
        achievement: { icon: CheckCircle, color: "text-yellow-400", border: "border-l-yellow-500", bg: "hover:bg-yellow-500/5" }
    };

    const style = typeStyles[data.category] || typeStyles.system;
    const Icon = style.icon;

    // Time ago calculator or formatter
    const formattedTime = React.useMemo(() => {
        const diffMs = Date.now() - new Date(data.createdAt).getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return "ahora";
        if (diffMins < 60) return `${diffMins}m`;
        const diffHrs = Math.floor(diffMins / 60);
        if (diffHrs < 24) return `${diffHrs}h`;
        return new Date(data.createdAt).toLocaleDateString();
    }, [data.createdAt]);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className={cn(
                "relative flex gap-3 p-3 bg-white/5 border border-white/5 rounded-lg transition-colors group cursor-default",
                "border-l-2",
                style.border,
                style.bg
            )}
        >
            <div className={cn("mt-1 shrink-0", style.color)}>
                <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 space-y-1">
                <div className="flex justify-between items-start gap-2">
                    <h4 className="text-xs font-semibold leading-tight text-white/95 truncate">{data.title}</h4>
                    <span className="text-[9px] text-muted-foreground shrink-0 font-mono">{formattedTime}</span>
                </div>
                {data.body && (
                    <p className="text-[11px] text-muted-foreground leading-normal pr-4">
                        {data.body}
                    </p>
                )}
            </div>

            <button
                onClick={onDismiss}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-white"
                title="Archivar"
            >
                <X className="w-3.5 h-3.5" />
            </button>
        </motion.div>
    );
}

// Temporary internal micro-icon
function BotIcon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={props.className}
        >
            <path d="M12 8V4H8" />
            <rect width="16" height="12" x="4" y="8" rx="2" />
            <path d="M2 14h2" />
            <path d="M20 14h2" />
            <path d="M15 13v2" />
            <path d="M9 13v2" />
        </svg>
    );
}
