"use client";

/**
 * NotificationsTab — sección «Alertas» del Centro de Control: las 5 notificaciones más recientes con su
 * categoría, archivar cada una (botón siempre visible, 44 px: antes solo aparecía al pasar el ratón y en
 * el móvil no existía), limpiar todo y la página completa con el registro.
 */
import React from "react";
import Link from "next/link";
import { AlertTriangle, Bell, Bot, CheckCircle, ExternalLink, Info, X, type LucideIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useNotifications, type AppNotification } from "@/context/notifications-context";

interface EstiloCategoria {
    icono: LucideIcon;
    color: string;
    borde: string;
}

// Clases escritas enteras: Tailwind solo ve las que aparecen completas en el código.
const ESTILOS: Record<string, EstiloCategoria> = {
    system: { icono: Info, color: "text-sky-300", borde: "border-l-sky-400" },
    ai: { icono: Bot, color: "text-cyan-300", borde: "border-l-cyan-400" },
    mention: { icono: Bell, color: "text-pink-300", borde: "border-l-pink-400" },
    governance: { icono: AlertTriangle, color: "text-red-300", borde: "border-l-red-400" },
    culture: { icono: CheckCircle, color: "text-purple-300", borde: "border-l-purple-400" },
    education: { icono: CheckCircle, color: "text-emerald-300", borde: "border-l-emerald-400" },
    community: { icono: Info, color: "text-indigo-300", borde: "border-l-indigo-400" },
    achievement: { icono: CheckCircle, color: "text-yellow-300", borde: "border-l-yellow-400" },
};

export function NotificationsTab() {
    const { inbox, clearAll, archive } = useNotifications();

    // Solo las 5 más recientes en el panel; el resto, en la página completa.
    const recientes = React.useMemo(() => inbox.slice(0, 5), [inbox]);

    return (
        <div className="space-y-3 pt-1" data-testid="seccion-alertas">
            <div className="flex items-center justify-between gap-2 border-b border-amber-300/15">
                <h3 className="m-0 flex min-h-[44px] items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/80">
                    <Bell className="h-4 w-4" aria-hidden="true" /> Recientes ({inbox.length})
                </h3>
                {inbox.length > 0 && (
                    <button
                        type="button"
                        onClick={clearAll}
                        className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg px-2 text-[12px] text-red-300 outline-none transition-colors duration-150 hover:text-red-200 focus-visible:ring-2 focus-visible:ring-amber-300/70"
                    >
                        Limpiar todo
                    </button>
                )}
            </div>

            <ul className="space-y-2" aria-label="Notificaciones recientes">
                <AnimatePresence mode="popLayout" initial={false}>
                    {recientes.map((notif) => (
                        <NotificationItem key={notif.id} data={notif} onDismiss={() => archive(notif.id)} />
                    ))}
                </AnimatePresence>
            </ul>

            {recientes.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                    <Bell className="h-8 w-8 text-amber-300/40" aria-hidden="true" />
                    <span className="text-[13px] text-amber-100/65">Sin notificaciones nuevas</span>
                </div>
            )}

            <Link
                href="/notifications"
                className="flex min-h-[48px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-amber-300/40 bg-amber-400/10 px-4 text-[13px] font-medium text-amber-100 outline-none transition-colors duration-150 hover:bg-amber-400/20 focus-visible:ring-2 focus-visible:ring-amber-300/70"
            >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Ver página completa y registro
            </Link>
        </div>
    );
}

function NotificationItem({ data, onDismiss }: { data: AppNotification; onDismiss: () => void }) {
    const estilo = ESTILOS[data.category] ?? ESTILOS.system;
    const Icono = estilo.icono;

    const hora = React.useMemo(() => {
        const diffMs = Date.now() - new Date(data.createdAt).getTime();
        const mins = Math.floor(diffMs / 60000);
        if (mins < 1) return "ahora";
        if (mins < 60) return `${mins} min`;
        const horas = Math.floor(mins / 60);
        if (horas < 24) return `${horas} h`;
        return new Date(data.createdAt).toLocaleDateString();
    }, [data.createdAt]);

    return (
        <motion.li
            layout
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.2 }}
            className={cn("flex items-start gap-2 rounded-xl border border-l-2 border-white/10 bg-white/[0.04] py-2 pl-3 pr-1", estilo.borde)}
        >
            <Icono className={cn("mt-1 h-4 w-4 shrink-0", estilo.color)} aria-hidden="true" />
            <div className="min-w-0 flex-1 space-y-0.5 py-1">
                <div className="flex items-start justify-between gap-2">
                    <h4 className="m-0 text-[13px] font-semibold leading-tight text-amber-50">{data.title}</h4>
                    <span className="shrink-0 font-mono text-[10px] text-amber-100/50">{hora}</span>
                </div>
                {data.body && <p className="m-0 text-[12px] leading-snug text-amber-100/65">{data.body}</p>}
            </div>
            <button
                type="button"
                onClick={onDismiss}
                title="Archivar"
                aria-label={`Archivar «${data.title}»`}
                className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-lg text-amber-100/55 outline-none transition-colors duration-150 hover:bg-white/10 hover:text-amber-50 focus-visible:ring-2 focus-visible:ring-amber-300/70"
            >
                <X className="h-4 w-4" aria-hidden="true" />
            </button>
        </motion.li>
    );
}
