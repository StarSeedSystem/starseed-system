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
} from "lucide-react";
import { Logo } from "../logo";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";

export function NavigationBar({ position = "top" }: { position?: "top" | "bottom" }) {
    const pathname = usePathname();

    return (
        <div className={cn(
            "flex items-center justify-between bg-background/80 backdrop-blur-xl px-6 py-2 border-b",
            position === "bottom" && "border-t border-b-0 order-last"
        )}>
            <div className="flex items-center gap-6">
                <Link href="/" className="flex items-center gap-2 font-semibold">
                    <Logo />
                    <span className="hidden md:inline-block">StarSeed</span>
                </Link>

                <nav className="hidden md:flex items-center gap-1">
                    <NavItem href="/dashboard" icon={Home}>Dashboard</NavItem>
                    <NavItem href="/network" icon={Network}>Red</NavItem>
                    <NavItem href="/agent" icon={Bot}>Agente</NavItem>
                    <NavItem href="/hub" icon={Users}>Hub</NavItem>
                </nav>
            </div>

            <div className="flex items-center gap-1">
                <NavItem href="/publish" icon={PenSquare} labelOnly />
                <NavItem href="/messages" icon={MessageSquare} labelOnly />
                <NavItem href="/settings" icon={Settings} labelOnly />
                <NavItem href="/profile/starseeduser" icon={User} labelOnly />
            </div>
        </div>
    );
}

function NavItem({ href, children, icon: Icon, labelOnly = false }: { href: string; children?: React.ReactNode, icon?: any, labelOnly?: boolean }) {
    const pathname = usePathname();
    const isActive = pathname.startsWith(href);

    return (
        <Link
            href={href}
            className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted hover:text-primary",
                isActive ? "bg-muted text-primary" : "text-muted-foreground"
            )}
            title={labelOnly && typeof children === 'string' ? children : undefined}
        >
            {Icon && <Icon className="h-4 w-4" />}
            {!labelOnly && children}
        </Link>
    );
}
