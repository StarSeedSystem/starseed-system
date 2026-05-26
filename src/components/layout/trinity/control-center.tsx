"use client";

import React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Settings, Sliders, Home, Bell, Maximize2, Minimize2, Monitor, X } from "lucide-react";
import { SystemTab } from "./tabs/system-tab";
import { QuickSettingsTab } from "./tabs/quick-settings-tab";
import { SmartHomeTab } from "./tabs/smart-home-tab";
import { NotificationsTab } from "./tabs/notifications-tab";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { usePerimeter } from "@/context/perimeter-context";
import { useFullscreen } from "@/hooks/useFullscreen";

export function ControlCenter() {
    const { setActiveEdge } = usePerimeter();
    const { isFullscreen, toggle: toggleFullscreen, isSupported } = useFullscreen();

    const handleClose = () => {
        setActiveEdge(null);
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: 20, scale: 0.95, filter: "blur(10px)" }}
            animate={{ opacity: 1, x: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, x: 20, scale: 0.95, filter: "blur(10px)" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={cn(
                "bg-black/80 backdrop-blur-3xl border border-white/10 overflow-hidden shadow-2xl flex flex-col pointer-events-auto relative ring-1 ring-white/5",
                // Mobile: fullscreen | Desktop: wide floating panel
                "fixed inset-0 z-[100] rounded-none",
                "md:static md:inset-auto md:z-auto md:w-[420px] md:h-[600px] md:rounded-[2rem]",
                "lg:w-[460px] lg:h-[640px]"
            )}
        >
            {/* Ambient Background Glow */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-cyan-500/10 via-primary/5 to-transparent rounded-full blur-[100px] pointer-events-none -z-10" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-purple-500/10 via-amber-500/5 to-transparent rounded-full blur-[80px] pointer-events-none -z-10" />

            {/* Premium Header */}
            <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-white/5 bg-gradient-to-r from-white/[0.02] to-transparent shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 shrink-0">
                        <Monitor className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="min-w-0">
                        <span className="text-sm font-semibold text-white/90 tracking-wide truncate block">Centro de Control</span>
                        <p className="text-[9px] font-mono text-white/30 uppercase tracking-[0.15em] mt-0.5 truncate">Panel de Lógica · StarSeed OS</p>
                    </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    {isSupported && (
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={toggleFullscreen}
                            className="w-8 h-8 rounded-xl hover:bg-white/10 text-white/50 hover:text-white transition-all"
                            title={isFullscreen ? "Salir pantalla completa" : "Pantalla completa del programa"}
                        >
                            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                        </Button>
                    )}
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={handleClose}
                        className="w-8 h-8 rounded-xl hover:bg-red-500/10 text-white/50 hover:text-red-400 transition-all md:hidden"
                        title="Cerrar"
                    >
                        <X className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="quick" className="flex-1 flex flex-col z-10 min-h-0">
                {/* Tab Navigation */}
                <div className="px-4 pt-3 pb-2 shrink-0">
                    <TabsList className="grid w-full grid-cols-4 bg-black/30 h-12 md:h-14 p-1 rounded-2xl gap-1.5 border border-white/5">
                        <TabItem value="system" icon={Settings} label="Sistema" activeColor="text-blue-400" bgColor="bg-blue-500/10" borderColor="border-blue-500/20" />
                        <TabItem value="quick" icon={Sliders} label="Control" activeColor="text-cyan-400" bgColor="bg-cyan-500/10" borderColor="border-cyan-500/20" />
                        <TabItem value="home" icon={Home} label="Hogar" activeColor="text-emerald-400" bgColor="bg-emerald-500/10" borderColor="border-emerald-500/20" />
                        <TabItem value="notif" icon={Bell} label="Alertas" activeColor="text-red-400" bgColor="bg-red-500/10" borderColor="border-red-500/20" />
                    </TabsList>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-hidden relative min-h-0">
                    <TabsContent value="system" className="h-full m-0 overflow-y-auto overscroll-contain p-4 md:p-5 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:zoom-in-95 data-[state=active]:slide-in-from-bottom-2 duration-300">
                        <SystemTab />
                    </TabsContent>
                    <TabsContent value="quick" className="h-full m-0 overflow-y-auto overscroll-contain p-4 md:p-5 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:zoom-in-95 data-[state=active]:slide-in-from-bottom-2 duration-300">
                        <QuickSettingsTab />
                    </TabsContent>
                    <TabsContent value="home" className="h-full m-0 overflow-y-auto overscroll-contain p-4 md:p-5 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:zoom-in-95 data-[state=active]:slide-in-from-bottom-2 duration-300">
                        <SmartHomeTab />
                    </TabsContent>
                    <TabsContent value="notif" className="h-full m-0 overflow-y-auto overscroll-contain p-0 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:zoom-in-95 data-[state=active]:slide-in-from-bottom-2 duration-300">
                        <NotificationsTab />
                    </TabsContent>

                    {/* Scroll Fade */}
                    <div className="absolute bottom-0 left-0 w-full h-14 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
                </div>
            </Tabs>

            {/* Bottom Status Bar */}
            <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between shrink-0 bg-white/[0.01]">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981] animate-pulse shrink-0" />
                    <span className="text-[9px] font-mono text-white/30 uppercase tracking-wider truncate">Sistema · En línea</span>
                </div>
                <span className="text-[9px] font-mono text-white/20 shrink-0">v0.1α</span>
            </div>
        </motion.div>
    );
}

function TabItem({ value, icon: Icon, label, activeColor, bgColor, borderColor }: {
    value: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    activeColor: string;
    bgColor: string;
    borderColor: string;
}) {
    return (
        <TabsTrigger
            value={value}
            className={cn(
                "h-full w-full rounded-xl transition-all duration-300 bg-transparent hover:bg-white/5 border border-transparent flex flex-col items-center justify-center gap-0.5",
                `data-[state=active]:${bgColor} data-[state=active]:${borderColor} data-[state=active]:border`,
                `data-[state=active]:${activeColor} data-[state=active]:shadow-lg`
            )}
        >
            <Icon className="w-4 h-4 md:w-5 md:h-5" />
            <span className="text-[8px] md:text-[9px] font-mono uppercase tracking-wider opacity-70">{label}</span>
        </TabsTrigger>
    );
}
