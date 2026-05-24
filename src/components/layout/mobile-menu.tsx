"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Home, User, Bot, MessageSquare, Users, Network,
    PenSquare, Globe, Library, Info, Settings, Sparkles
} from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";
import { useAppearance } from "@/context/appearance-context";
import { useControlPanel } from "@/context/control-panel-context";

export interface MobileMenuProps {
    onClose: () => void;
}

interface NavItemProps {
    href: string;
    icon: React.ElementType;
    label: string;
    description?: string;
    isActive?: boolean;
    onClick?: () => void;
}

function NavItem({ href, icon: Icon, label, description, isActive, onClick }: NavItemProps) {
    return (
        <Link
            href={href}
            onClick={onClick}
            className={cn(
                "flex items-center gap-4 p-4 rounded-2xl",
                "transition-all duration-300 ease-out",
                "hover:bg-primary/10 hover:scale-[1.02]",
                "active:scale-95 active:bg-primary/20",
                isActive && "bg-primary/15 border border-primary/30"
            )}
        >
            <div className={cn(
                "flex items-center justify-center w-12 h-12 rounded-xl",
                "bg-gradient-to-br from-primary/20 to-primary/5",
                "border border-primary/20",
                isActive && "from-primary/40 to-primary/20 border-primary/40"
            )}>
                <Icon className="w-6 h-6 text-primary" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
                <p className={cn(
                    "text-base font-medium truncate",
                    isActive && "text-primary"
                )}>
                    {label}
                </p>
                {description && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {description}
                    </p>
                )}
            </div>
        </Link>
    );
}

export function MobileMenu({ onClose }: MobileMenuProps) {
    const pathname = usePathname();
    const { config } = useAppearance();
    const { toggle: toggleControlPanel } = useControlPanel();
    const { menuAnimation, compactMode } = config.mobile;

    const mainNavItems = [
        { href: "/dashboard", icon: Home, label: "Dashboard", description: "Centro de mando" },
        { href: "/profile/starseeduser", icon: User, label: "Perfil", description: "Tu identidad soberana" },
        { href: "/agent", icon: Bot, label: "Asistente IA", description: "Agente personal" },
        { href: "/messages", icon: MessageSquare, label: "Mensajes", description: "Comunicación directa" },
    ];

    const networkNavItems = [
        { href: "/hub", icon: Users, label: "Hub", description: "Comunidad activa" },
        { href: "/network", icon: Network, label: "La Red", description: "Grafo de conexiones" },
        { href: "/explorer", icon: Globe, label: "Explorador", description: "Descubrimiento universal" },
    ];

    const toolsNavItems = [
        { href: "/publish", icon: PenSquare, label: "Publicar", description: "Crear contenido" },
        { href: "/library", icon: Library, label: "Biblioteca", description: "Recursos y archivos" },
        { href: "/info", icon: Info, label: "Información", description: "Guías y ayuda" },
        { href: "/settings", icon: Settings, label: "Configuración", description: "Personalizar sistema" },
    ];

    const renderNavSection = (items: typeof mainNavItems, title?: string) => (
        <div className="space-y-1">
            {title && (
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 mb-2">
                    {title}
                </p>
            )}
            {items.map((item) => (
                <NavItem
                    key={item.href}
                    {...item}
                    isActive={pathname === item.href || pathname.startsWith(item.href + '/')}
                    onClick={onClose}
                    description={compactMode ? undefined : item.description}
                />
            ))}
        </div>
    );

    return (
        <div className="flex flex-col h-full bg-background/95 backdrop-blur-2xl">
            {/* Header with Logo */}
            <div className="flex items-center justify-center py-6 border-b border-white/10">
                <Link href="/" onClick={onClose} className="flex items-center gap-3">
                    <Logo />
                </Link>
            </div>

            {/* Scrollable Navigation */}
            <div className={cn(
                "flex-1 overflow-y-auto",
                "px-4 py-6",
                compactMode ? "space-y-4" : "space-y-6"
            )}>
                {renderNavSection(mainNavItems, "Principal")}

                <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                {renderNavSection(networkNavItems, "Red")}

                <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                {renderNavSection(toolsNavItems, "Herramientas")}
            </div>

            {/* Footer with Control Panel */}
            <div className="p-4 border-t border-white/10">
                <button
                    onClick={() => {
                        onClose();
                        toggleControlPanel();
                    }}
                    className={cn(
                        "w-full flex items-center justify-center gap-3 p-4 rounded-2xl",
                        "bg-gradient-to-r from-primary/20 via-purple-500/20 to-pink-500/20",
                        "border border-primary/30",
                        "transition-all duration-300",
                        "hover:from-primary/30 hover:via-purple-500/30 hover:to-pink-500/30",
                        "hover:scale-[1.02] active:scale-95"
                    )}
                >
                    <Sparkles className="w-5 h-5 text-primary" />
                    <span className="font-medium">Panel de Control</span>
                </button>
            </div>
        </div>
    );
}

