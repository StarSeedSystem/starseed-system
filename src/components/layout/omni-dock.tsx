"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePerimeter } from "@/context/perimeter-context";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    Home,
    User,
    MessageSquare,
    Bell,
    Users,
    Book, // Personal Library
    Library, // Online Library
    Network, // Nodes
    Settings,
    Plus,
} from "lucide-react";

import { useAppearance } from "@/context/appearance-context";

export function OmniDock() {
    const { activeEdge } = usePerimeter();
    const { config } = useAppearance();
    const router = useRouter();

    const { dockBehavior = "anchor-only" } = config?.trinity || {};

    let isVisible = false;
    if (dockBehavior === "always-visible") {
        isVisible = true;
    } else {
        isVisible = activeEdge === "anchor";
    }

    // Dock Items Configuration - Increased icon sizes
    const dockItems = [
        { id: "dashboard", label: "Dashboard", icon: <Home className="w-6 h-6 sm:w-7 sm:h-7" />, path: "/dashboard", color: "cyan" },
        { id: "profile", label: "Perfil", icon: <User className="w-6 h-6 sm:w-7 sm:h-7" />, path: "/profile/starseeduser", color: "neutral" },
        { id: "messages", label: "Mensajes", icon: <MessageSquare className="w-6 h-6 sm:w-7 sm:h-7" />, path: "/messages", color: "crimson" },
        { id: "notifications", label: "Notificaciones", icon: <Bell className="w-6 h-6 sm:w-7 sm:h-7" />, path: "/notifications", color: "amber" },
        { id: "hub", label: "Hub", icon: <Users className="w-6 h-6 sm:w-7 sm:h-7" />, path: "/hub", color: "emerald" },
        { id: "mylib", label: "Mi Biblioteca", icon: <Book className="w-6 h-6 sm:w-7 sm:h-7" />, path: "/library?view=personal", color: "cyan" },
        { id: "netlib", label: "Librería Global", icon: <Library className="w-6 h-6 sm:w-7 sm:h-7" />, path: "/library?view=global", color: "cyan" },
        { id: "nodes", label: "Nodos", icon: <Network className="w-6 h-6 sm:w-7 sm:h-7" />, path: "/network", color: "crimson" },
        { id: "settings", label: "Ajustes", icon: <Settings className="w-6 h-6 sm:w-7 sm:h-7" />, path: "/settings", color: "neutral" },
    ];

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ y: "100%", opacity: 0 }}
                    animate={{ y: "0%", opacity: 1 }}
                    exit={{ y: "100%", opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="fixed bottom-0 left-0 right-0 z-[70] flex justify-center pb-6 sm:pb-8 pointer-events-none"
                >
                    <div className="
                        pointer-events-auto
                        flex items-end gap-2 sm:gap-4 p-4 sm:p-5
                        bg-card/40 dark:bg-black/40 backdrop-blur-2xl
                        border border-foreground/10
                        rounded-[--radius-full]
                        shadow-[0_10px_40px_rgba(0,0,0,0.2)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.5)]
                        mb-2 sm:mb-4
                    ">
                        {dockItems.map((item) => (
                            <DockItem
                                key={item.id}
                                icon={item.icon}
                                label={item.label}
                                color={item.color as any}
                                onClick={() => router.push(item.path)}
                            />
                        ))}

                        {/* Divider */}
                        <div className="w-px h-12 sm:h-14 bg-foreground/10 mx-2 self-center rounded-full" />

                        {/* Add/Customize Button */}
                        <DockItem
                            icon={<Plus className="w-6 h-6 sm:w-7 sm:h-7" />}
                            label="Personalizar"
                            color="neutral"
                            onClick={() => console.log("Open customization modal")}
                        />
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

function DockItem({ icon, label, onClick, color = "neutral" }: { icon: React.ReactNode, label: string, onClick: () => void, color?: "neutral" | "cyan" | "crimson" | "amber" | "emerald" }) {
    // Theme-agnostic color variables applied with semantic foreground values
    const colorStyles = {
        neutral: "hover:bg-foreground/10 text-foreground/80 hover:text-foreground",
        cyan: "text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/20 hover:shadow-[0_0_15px_rgba(34,211,238,0.3)]",
        crimson: "text-red-600 dark:text-red-400 hover:bg-red-500/20 hover:shadow-[0_0_15px_rgba(248,113,113,0.3)]",
        amber: "text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 hover:shadow-[0_0_15px_rgba(251,191,36,0.3)]",
        emerald: "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 hover:shadow-[0_0_15px_rgba(52,211,153,0.3)]",
    };

    return (
        <div className="group relative flex flex-col items-center gap-2">
            {/* Tooltip Label (Above) */}
            <span className="
                absolute -top-12 scale-0 opacity-0 
                group-hover:scale-100 group-hover:opacity-100
                transition-all duration-300
                bg-foreground text-background text-xs sm:text-sm font-medium px-3 py-1.5 rounded-full
                border border-background/20 whitespace-nowrap drop-shadow-md z-50
            ">
                {label}
            </span>

            <button
                onClick={onClick}
                className={cn(
                    "relative flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-[--radius-full] transition-all duration-300 active:scale-95 group-hover:scale-110",
                    "before:absolute before:inset-0 before:rounded-[--radius-full] before:border before:border-transparent hover:before:border-foreground/20",
                    colorStyles[color]
                )}
            >
                {icon}
            </button>

            {/* Reflection/Glow Base Indicator */}
            <div className="w-1.5 h-1.5 rounded-full bg-foreground/20 group-hover:bg-foreground/80 transition-colors" />
        </div>
    );
}
