'use client';

// ════════════════════════════════════════════════════════════════
// QuickAccessWidget — "Accesos rápidos"
// ----------------------------------------------------------------
// Lanzadera compacta y adaptable a las ÁREAS REALES del sistema
// operativo (rutas internas que ya existen) + acciones de creación
// rápida. No inventa datos: son enlaces reales de navegación. Cuando
// hay sesión, muestra accesos personales (perfil, baúles, memorias);
// sin sesión, invita a entrar para los privados. Densidad adaptativa
// vía el render-prop de WidgetShell (micro → sólo iconos).
// ════════════════════════════════════════════════════════════════

import Link from "next/link";
import { useState, useEffect } from "react";
import {
    Compass, Network, Users, PenSquare, Library, Bot, CalendarDays,
    Archive, Brain, MessageSquare, LayoutGrid, User, Plus, LogIn,
    Bell, AppWindow, Settings, PenLine, ShieldCheck, Server, Vote,
    Lightbulb, Cpu, ShoppingBag, Award, GitBranch, Sparkles, Zap,
    Wrench, Plug, Eye, HardDrive, Boxes, Camera, Images, CircleUser,
    type LucideIcon,
} from "lucide-react";
import { WidgetShell } from "../kit";
import { useCurrentUid } from "@/lib/widget-data/os-live";
import { loadDockConfig, type DockIconKey } from "@/components/layout/dock-config";

const ACCENT = "#a78bfa";

// Mapa liviano DockIconKey → LucideIcon (solo para reflejar el dock REAL del
// usuario aquí; no compite con el mapa completo de omni-dock.tsx). Claves sin
// entrada caen a LayoutGrid — nunca rompe.
const DOCK_ICON: Partial<Record<DockIconKey, LucideIcon>> = {
    LayoutDashboard: LayoutGrid, CircleUser, MessagesSquare: MessageSquare, Bell, Users,
    BookOpen: Library, Library, Network, BrainCircuit: Brain, Settings,
    Compass, PenLine, ShieldCheck, LayoutGrid, Server,
    Vote, Lightbulb, Cpu, ShoppingBag,
    Award, AppWindow, CalendarClock: CalendarDays, GitBranch, Sparkles,
    Zap, Wrench, Plug, Eye, HardDrive, Boxes,
    Camera, Images,
};

interface Access {
    label: string;
    href: string;
    icon: LucideIcon;
    color: string;
    /** requiere sesión para tener sentido (datos del propietario). */
    privateArea?: boolean;
}

// Accesos públicos (siempre útiles).
const PUBLIC_ACCESS: Access[] = [
    { label: "La Red", href: "/network", icon: Network, color: "#38bdf8" },
    { label: "Explorar", href: "/hub", icon: Compass, color: "#22d3ee" },
    { label: "Comunidades", href: "/hub", icon: Users, color: "#9FE870" },
    { label: "Biblioteca", href: "/library", icon: Library, color: "#f59e0b" },
    { label: "Agente IA", href: "/agent", icon: Bot, color: "#c084fc" },
    { label: "Eventos", href: "/hub", icon: CalendarDays, color: "#fb7185" },
];

// Accesos personales (mejores con sesión).
const PRIVATE_ACCESS: Access[] = [
    { label: "Perfil", href: "/profile/starseeduser", icon: User, color: "#a78bfa", privateArea: true },
    { label: "Mensajes", href: "/messages", icon: MessageSquare, color: "#0ea5e9", privateArea: true },
    { label: "Baúles", href: "/library", icon: Archive, color: "#fbbf24", privateArea: true },
    { label: "Memorias", href: "/library", icon: Brain, color: "#34d399", privateArea: true },
];

// Acciones de creación rápida (CTA).
const QUICK_ACTIONS: Access[] = [
    { label: "Publicar", href: "/publish", icon: PenSquare, color: "#f472b6" },
    { label: "Pizarra", href: "/pizarra", icon: LayoutGrid, color: "#a78bfa" },
];

function Tile({ a, micro }: { a: Access; micro: boolean }) {
    const Icon = a.icon;
    return (
        <Link
            href={a.href}
            title={a.label}
            className="group flex flex-col items-center justify-center gap-1.5 rounded-xl border border-border/40 bg-white/[0.02] p-2 text-center transition-colors hover:border-white/25 hover:bg-white/[0.05] cursor-pointer"
        >
            <span
                className="grid size-9 place-items-center rounded-xl border transition-transform group-hover:scale-110"
                style={{ color: a.color, borderColor: `${a.color}44`, background: `${a.color}1a` }}
            >
                <Icon className="size-4" strokeWidth={1.75} />
            </span>
            {!micro && (
                <span className="text-[10px] font-semibold leading-tight text-foreground/80 line-clamp-1">{a.label}</span>
            )}
        </Link>
    );
}

const DOCK_COLOR_HEX: Record<string, string> = {
    neutral: "#94a3b8", cyan: "#22d3ee", crimson: "#f43f5e", amber: "#f59e0b", emerald: "#34d399", purple: "#a78bfa",
};

export function QuickAccessWidget() {
    const { uid, ready } = useCurrentUid();
    const signedIn = ready && !!uid;

    // Dock REAL del usuario (lo que de verdad tiene habilitado en su OmniDock),
    // añadido a la lanzadera curada de arriba — sin duplicar hrefs. Se lee tras
    // montar (localStorage no es SSR-safe) para no romper la hidratación.
    const [dockExtra, setDockExtra] = useState<Access[]>([]);
    useEffect(() => {
        try {
            const items = loadDockConfig()
                .filter((it) => it.enabled)
                .map((it): Access => ({
                    label: it.label,
                    href: it.path,
                    icon: DOCK_ICON[it.iconKey] ?? LayoutGrid,
                    color: DOCK_COLOR_HEX[it.color] ?? ACCENT,
                }));
            setDockExtra(items);
        } catch { /* defensivo: localStorage bloqueado */ }
    }, []);

    return (
        <WidgetShell
            title="Accesos rápidos"
            subtitle="Navega y crea al instante"
            icon={Compass}
            accent={ACCENT}
            connections={[
                { label: "Red", href: "/network", color: "#38bdf8", icon: Network },
                { label: "Hub", href: "/hub", color: "#9FE870", icon: Users },
                { label: "Biblioteca", href: "/library", color: "#f59e0b", icon: Library },
            ]}
            actions={
                <Link
                    href="/publish"
                    className="inline-flex items-center gap-1 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-fuchsia-300 hover:bg-fuchsia-500/20 transition-colors cursor-pointer"
                >
                    <Plus className="size-3" /> Crear
                </Link>
            }
        >
            {(size) => {
                const micro = size.tier === "micro" || size.vTier === "micro";
                const cols = size.tier === "micro" ? 3 : size.tier === "compact" ? 3 : 4;
                const base = signedIn ? [...PUBLIC_ACCESS, ...PRIVATE_ACCESS] : PUBLIC_ACCESS;
                const seenHref = new Set(base.map((a) => a.href));
                const access = [...base, ...dockExtra.filter((d) => !seenHref.has(d.href))];
                const max = micro ? 6 : size.vTier === "expanded" ? access.length : cols * 2;
                const shown = access.slice(0, max);

                return (
                    <div className="flex h-full flex-col gap-2 pt-1">
                        <div
                            className="grid flex-1 content-start gap-1.5"
                            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                        >
                            {shown.map((a) => (
                                <Tile key={a.label + a.href} a={a} micro={micro} />
                            ))}
                        </div>

                        {!micro && (
                            <div className="shrink-0">
                                {!signedIn && ready && (
                                    <Link
                                        href="/login"
                                        className="mb-1.5 flex items-center justify-center gap-1.5 rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-violet-300 hover:bg-violet-500/20 transition-colors cursor-pointer"
                                    >
                                        <LogIn className="size-3" /> Entra para tus accesos personales
                                    </Link>
                                )}
                                <div className="flex gap-1.5">
                                    {QUICK_ACTIONS.map((a) => {
                                        const Icon = a.icon;
                                        return (
                                            <Link
                                                key={a.label}
                                                href={a.href}
                                                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer"
                                                style={{ color: a.color, borderColor: `${a.color}44`, background: `${a.color}14` }}
                                            >
                                                <Icon className="size-3.5" /> {a.label}
                                            </Link>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                );
            }}
        </WidgetShell>
    );
}

export default QuickAccessWidget;
