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
    LayoutDashboard
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function OmniDock() {
    const { activeEdge } = usePerimeter();
    const router = useRouter();
    const isVisible = activeEdge === "anchor";

    // Dock Items Configuration
    const dockItems = [
        { id: "dashboard", label: "Dashboard", icon: <Home className="w-5 h-5" />, path: "/dashboard", color: "cyan" },
        { id: "profile", label: "Perfil", icon: <User className="w-5 h-5" />, path: "/profile/starseeduser", color: "neutral" },
        { id: "messages", label: "Mensajes", icon: <MessageSquare className="w-5 h-5" />, path: "/messages", color: "crimson" },
        { id: "notifications", label: "Notificaciones", icon: <Bell className="w-5 h-5" />, path: "/notifications", color: "amber" },
        { id: "hub", label: "Hub", icon: <Users className="w-5 h-5" />, path: "/hub", color: "emerald" },
        { id: "mylib", label: "Mi Biblioteca", icon: <Book className="w-5 h-5" />, path: "/library/personal", color: "cyan" },
        { id: "netlib", label: "Librería Global", icon: <Library className="w-5 h-5" />, path: "/library/global", color: "cyan" },
        { id: "nodes", label: "Nodos", icon: <Network className="w-5 h-5" />, path: "/network", color: "crimson" },
        { id: "settings", label: "Ajustes", icon: <Settings className="w-5 h-5" />, path: "/settings", color: "neutral" },
    ];

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ y: "100%", opacity: 0 }}
                    animate={{ y: "0%", opacity: 1 }}
                    exit={{ y: "100%", opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="fixed bottom-0 left-0 right-0 z-[70] flex justify-center pb-6 pointer-events-none"
                >
                    {/* 
                      Glass Container 
                      pointer-events-auto ensures clicks work despite parent being none 
                    */}
                    <div className="
                        pointer-events-auto
                        flex items-end gap-2 p-3
                        bg-black/40 backdrop-blur-xl
                        border border-white/10
                        rounded-2xl
                        shadow-[0_10px_40px_rgba(0,0,0,0.5)]
                        mb-2
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
                        <div className="w-px h-10 bg-white/10 mx-1 self-center" />

                        {/* Add/Customize Button */}
                        <DockItem
                            icon={<Plus className="w-5 h-5" />}
                            label="Personalizar"
                            color="neutral"
                            onClick={() => console.log("Open customization modal")} // TODO: Connect to customization logic
                        />
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// Sub-component for individual dock items
function DockItem({ icon, label, onClick, color = "neutral" }: { icon: React.ReactNode, label: string, onClick: () => void, color?: "neutral" | "cyan" | "crimson" | "amber" | "emerald" }) {

    const colorStyles = {
        neutral: "hover:bg-white/20 text-foreground",
        cyan: "text-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-200 hover:shadow-[0_0_15px_rgba(34,211,238,0.3)]",
        crimson: "text-red-400 hover:bg-red-500/20 hover:text-red-200 hover:shadow-[0_0_15px_rgba(248,113,113,0.3)]",
        amber: "text-amber-400 hover:bg-amber-500/20 hover:text-amber-200 hover:shadow-[0_0_15px_rgba(251,191,36,0.3)]",
        emerald: "text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-200 hover:shadow-[0_0_15px_rgba(52,211,153,0.3)]",
    };

    return (
        <div className="group relative flex flex-col items-center gap-1">
            {/* Tooltip Label (Above) */}
            <span className="
                absolute -top-10 scale-0 opacity-0 
                group-hover:scale-100 group-hover:opacity-100
                transition-all duration-200
                bg-black/90 text-white text-[10px] font-medium px-2 py-1 rounded
                border border-white/10 whitespace-nowrap
            ">
                {label}
            </span>

            <button
                onClick={onClick}
                className={cn(
                    "relative flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-200 active:scale-95",
                    colorStyles[color]
                )}
            >
                {icon}
            </button>

            {/* Reflection/Glow Base */}
            <div className="w-1 h-1 rounded-full bg-white/20 group-hover:bg-white/80 transition-colors" />
        </div>
    );
}
