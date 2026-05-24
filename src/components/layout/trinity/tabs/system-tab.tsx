"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Settings, User, Shield, HardDrive, Cpu, Sliders } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function SystemTab() {
    const router = useRouter();

    const menuItems = [
        { label: "Configuración", icon: Settings, path: "/settings", color: "text-blue-400", border: "hover:border-blue-500/50" },
        { label: "Perfil", icon: User, path: "/profile/starseeduser", color: "text-purple-400", border: "hover:border-purple-500/50" },
        { label: "Privacidad", icon: Shield, path: "/settings/privacy", color: "text-emerald-400", border: "hover:border-emerald-500/50" },
        { label: "Almacenamiento", icon: HardDrive, path: "/settings/storage", color: "text-amber-400", border: "hover:border-amber-500/50" },
        { label: "Sistema", icon: Cpu, path: "/settings/system", color: "text-cyan-400", border: "hover:border-cyan-500/50" },
        { label: "Apariencia", icon: Sliders, path: "/settings/appearance", color: "text-pink-400", border: "hover:border-pink-500/50" },
    ];

    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.05 }
        }
    };

    const item = {
        hidden: { opacity: 0, y: 10 },
        show: { opacity: 1, y: 0 }
    };

    return (
        <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 gap-3"
        >
            {menuItems.map((menuItem) => (
                <motion.button
                    key={menuItem.label}
                    variants={item}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => router.push(menuItem.path)}
                    className={cn(
                        "flex flex-col items-center justify-center h-24 gap-3",
                        "bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all duration-300",
                        "hover:shadow-lg hover:shadow-black/20 group",
                        menuItem.border
                    )}
                >
                    <div className={cn("p-2 rounded-full bg-white/5 group-hover:bg-white/10 transition-colors", menuItem.color)}>
                        <menuItem.icon className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                        {menuItem.label}
                    </span>
                </motion.button>
            ))}
        </motion.div>
    );
}
