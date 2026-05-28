"use client";

import Link from "next/link";
import {
    Home,
    Bot,
    MessageSquare,
    Users,
    Network,
    PenSquare,
    Library,
    Settings,
    User,
    Compass,
    Globe,
    Sparkles,
} from "lucide-react";
import { Logo } from "../logo";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";

export function NavigationBar({ position = "top" }: { position?: "top" | "bottom" }) {
    const pathname = usePathname();

    return (
        <div className={cn(
            "flex items-center justify-between backdrop-blur-xl border-b liquid-glass-panel shadow-sm transition-all duration-300 w-full max-w-[98vw] mx-auto rounded-b-2xl md:rounded-b-3xl",
            position === "bottom" && "border-t border-b-0 order-last rounded-t-2xl md:rounded-t-3xl rounded-b-none"
        )}
            style={{ paddingInline: 'clamp(1rem,3vw,2.5rem)', paddingBlock: 'clamp(0.5rem,1vw,1rem)' }}
        >
            {/* Left — Logo + Brand */}
            <div className="flex items-center gap-3 flex-shrink-0">
                <Link href="/" className="flex items-center gap-2 font-semibold group">
                    <Logo />
                    <span className="hidden md:inline-block text-sm font-bold tracking-wide bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                        StarSeed
                    </span>
                </Link>
            </div>

            {/* Center — Primary Nav (fully centered, max width optimization) */}
            <nav className="hidden md:flex items-center justify-center gap-1 absolute left-1/2 -translate-x-1/2 w-full max-w-fit mx-auto">
                <NavItem href="/dashboard" icon={Home}>Dashboard</NavItem>
                <NavItem href="/network" icon={Network}>Red</NavItem>
                <NavItem href="/agent" icon={Bot}>Agente</NavItem>
                <NavItem href="/hub" icon={Users}>Hub</NavItem>
                <NavItem href="/explorer" icon={Compass}>Explorar</NavItem>
            </nav>

            {/* Right — Actions */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
                <NavItem href="/publish" icon={PenSquare} labelOnly title="Publicar" />
                <NavItem href="/messages" icon={MessageSquare} labelOnly title="Mensajes" />
                <NavItem href="/ai-setup" icon={Sparkles} labelOnly title="Ecosistema IA" />
                <NavItem href="/settings" icon={Settings} labelOnly title="Ajustes" />
                <NavItem href="/profile/starseeduser" icon={User} labelOnly title="Perfil" />
            </div>
        </div>
    );
}

function NavItem({
    href,
    children,
    icon: Icon,
    labelOnly = false,
    title,
}: {
    href: string;
    children?: React.ReactNode;
    icon?: React.ComponentType<{ className?: string }>;
    labelOnly?: boolean;
    title?: string;
}) {
    const pathname = usePathname();
    const isActive = pathname === href || pathname.startsWith(href + "/");

    return (
        <Link
            href={href}
            title={title}
            className={cn(
                "relative flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200",
                "hover:bg-primary/10 hover:text-primary",
                isActive
                    ? "bg-primary/15 text-primary shadow-[inset_0_0_12px_rgba(139,92,246,0.1)]"
                    : "text-muted-foreground",
                labelOnly && "px-2.5"
            )}
        >
            {Icon && <Icon className={cn("h-[1.05rem] w-[1.05rem] flex-shrink-0", isActive && "text-primary")} />}
            {!labelOnly && (
                <span style={{ fontSize: 'clamp(0.75rem,0.7vw,0.875rem)' }}>
                    {children}
                </span>
            )}
            {/* Active underline dot */}
            {isActive && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary opacity-70" />
            )}
        </Link>
    );
}
