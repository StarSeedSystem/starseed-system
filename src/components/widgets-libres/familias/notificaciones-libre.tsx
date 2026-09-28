"use client";
/**
 * Notificaciones libres (Ola 383 · WL3) — burbujas. Cada aviso nuevo es una gota que flota;
 * al leerla se desprende hacia arriba y desaparece (la acción es la real: `seen = true` en
 * Supabase, como el widget clásico). micro = el número en un orbe que late · s = tres gotas ·
 * m/l = la lista de gotas · xl = agrupadas por origen. Sin nada nuevo: calma y «Todo al día».
 */
import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Check, CheckCheck } from "lucide-react";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import { personalidadDe } from "@/lib/widgets/forma/asignacion";
import { createClient } from "@/utils/supabase/client";
import { useMyNotifications, tsOf, type NotificationRow } from "@/lib/widget-data/os-live";
import { timeAgo } from "@/components/dashboard/kit";
import { Pildora, Rotulo, SinDato, disenoDe } from "./comun";

const NUEVA = "#DC143C";

function Gota({ n, onLeer, i, compacta }: { n: NotificationRow; onLeer: (id: string) => void; i: number; compacta?: boolean }) {
    return (
        <motion.li
            layout
            initial={{ opacity: 0, y: 12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -28, scale: 0.8, transition: { duration: 0.35 } }}
            className="list-none"
        >
          <div
            className="ss-flotar relative flex items-center gap-2 rounded-full py-1.5 pl-3 pr-1.5"
            style={{ ["--ss-dur" as string]: `${5 + (i % 3)}s`, animationDelay: `${i * 0.4}s`, background: `radial-gradient(120% 140% at 20% 30%, ${NUEVA}44, ${NUEVA}10 70%, transparent)` }}
          >
            <Link href={n.link || "/notifications"} className="min-w-0 flex-1 cursor-pointer">
                <span className="block truncate text-xs font-semibold text-white">{n.title || n.kind || "Aviso"}</span>
                {!compacta && <span className="block truncate text-[10px] text-white/60">{timeAgo(tsOf(n.created_at))}{n.body ? ` · ${n.body}` : ""}</span>}
            </Link>
            <button type="button" onClick={() => onLeer(n.id)} aria-label="Marcar como leída" title="Marcar como leída"
                className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-full text-white/60 transition-colors hover:bg-emerald-500/20 hover:text-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400">
                <Check className="size-3.5" />
            </button>
          </div>
        </motion.li>
    );
}

export function NotificacionesLibre() {
    const { rows, loading, authPending, needsAuth, reload } = useMyNotifications();
    const [leidas, setLeidas] = React.useState<Set<string>>(() => new Set());
    const todas = rows.map((r) => (leidas.has(r.id) ? { ...r, seen: true } : r));
    const nuevas = todas.filter((n) => !n.seen);
    const per = personalidadDe("NOTIFICATIONS");

    const leer = async (id: string) => {
        setLeidas((p) => new Set(p).add(id));
        try { await createClient().from("notifications").update({ seen: true }).eq("id", id); } catch { /* realtime reconcilia */ }
    };
    const leerTodas = async () => {
        const ids = nuevas.map((n) => n.id);
        setLeidas((p) => { const s = new Set(p); ids.forEach((i) => s.add(i)); return s; });
        try {
            const c = createClient();
            await Promise.all(ids.map((id) => c.from("notifications").update({ seen: true }).eq("id", id)));
            void reload();
        } catch { /* noop */ }
    };

    return (
        <WidgetLibre forma={per.forma} acento={nuevas.length ? NUEVA : "#23d5ab"} acento2="#7c5cff" etiqueta={`Notificaciones: ${nuevas.length} sin leer`} intensidad={nuevas.length ? 0.6 : 0.3}>
            {({ clase, ancho, alto }) => {
                const { base: b } = disenoDe(clase);
                if (needsAuth) return <SinDato texto="Entra para ver tus avisos" accion={<Link href="/login" className="cursor-pointer text-xs font-semibold text-violet-300 underline-offset-4 hover:underline">Entrar</Link>} />;
                if (authPending || (loading && rows.length === 0)) return <SinDato texto="escuchando…" />;
                if (b === "micro") {
                    const lado = Math.min(ancho, alto);
                    return (
                        <Link href="/notifications" aria-label={`${nuevas.length} notificaciones sin leer`} className="flex h-full cursor-pointer items-center justify-center">
                            <span className={`${nuevas.length ? "ss-latir" : "ss-respirar"} font-light tabular-nums text-white`} style={{ fontSize: lado * 0.38 }}>{nuevas.length}</span>
                        </Link>
                    );
                }
                if (nuevas.length === 0) {
                    return (
                        <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
                            <span className="ss-respirar text-sm font-medium text-white">Todo al día</span>
                            <Link href="/notifications" className="cursor-pointer text-[10px] text-white/60 hover:text-white">ver el historial</Link>
                        </div>
                    );
                }
                const max = b === "s" ? 3 : b === "m" ? 4 : 6;
                const cabecera = (
                    <div className="flex items-center justify-between gap-2 px-1">
                        <Rotulo color="#fda4af">{nuevas.length} nuevas</Rotulo>
                        {b !== "s" && <Pildora color="#10B981" onClick={leerTodas}><CheckCheck className="mr-1 inline size-3" />Leer todo</Pildora>}
                    </div>
                );
                if (b === "xl") {
                    const grupos = new Map<string, NotificationRow[]>();
                    for (const n of nuevas) grupos.set(n.kind || "otros", [...(grupos.get(n.kind || "otros") ?? []), n]);
                    return (
                        <div className="flex h-full flex-col gap-2 overflow-hidden p-2">
                            {cabecera}
                            <div className="grid flex-1 gap-3 overflow-hidden" style={{ gridTemplateColumns: `repeat(${Math.min(3, grupos.size)}, minmax(0,1fr))` }}>
                                {[...grupos.entries()].slice(0, 3).map(([k, lista]) => (
                                    <div key={k} className="flex min-w-0 flex-col gap-1.5">
                                        <Rotulo>{k} · {lista.length}</Rotulo>
                                        <ul className="flex flex-col gap-1.5"><AnimatePresence initial={false}>{lista.slice(0, 4).map((n, i) => <Gota key={n.id} n={n} i={i} onLeer={leer} compacta />)}</AnimatePresence></ul>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                }
                return (
                    <div className="flex h-full flex-col justify-center gap-2 overflow-hidden p-2">
                        {cabecera}
                        <ul className="flex flex-col gap-1.5"><AnimatePresence initial={false}>{nuevas.slice(0, max).map((n, i) => <Gota key={n.id} n={n} i={i} onLeer={leer} compacta={b === "s"} />)}</AnimatePresence></ul>
                    </div>
                );
            }}
        </WidgetLibre>
    );
}

export default NotificacionesLibre;
