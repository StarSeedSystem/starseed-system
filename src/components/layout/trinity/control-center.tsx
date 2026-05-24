"use client";

import React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Settings, Sliders, Home, Bell } from "lucide-react";
import { SystemTab } from "./tabs/system-tab";
import { QuickSettingsTab } from "./tabs/quick-settings-tab";
import { SmartHomeTab } from "./tabs/smart-home-tab";
import { NotificationsTab } from "./tabs/notifications-tab";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function ControlCenter() {
    return (
        <motion.div
            initial={{ opacity: 0, x: 20, scale: 0.95, filter: "blur(10px)" }}
            animate={{ opacity: 1, x: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, x: 20, scale: 0.95, filter: "blur(10px)" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="w-96 h-[500px] bg-black/60 backdrop-blur-3xl border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl flex flex-col pointer-events-auto relative ring-1 ring-white/5"
        >
            {/* Ambient Background Glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[80px] pointer-events-none -z-10" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-[80px] pointer-events-none -z-10" />

            <Tabs defaultValue="quick" className="flex-1 flex flex-col z-10">
                {/* Header / Tab Navigation */}
                <div className="p-4 border-b border-white/5 bg-white/5 backdrop-blur-xl">
                    <TabsList className="grid w-full grid-cols-4 bg-black/20 h-14 p-1 rounded-2xl gap-2 border border-white/5">
                        <TabItem value="system" icon={Settings} label="System" activeColor="text-blue-400" glowColor="shadow-blue-500/50" />
                        <TabItem value="quick" icon={Sliders} label="Control" activeColor="text-cyan-400" glowColor="shadow-cyan-500/50" />
                        <TabItem value="home" icon={Home} label="Home" activeColor="text-emerald-400" glowColor="shadow-emerald-500/50" />
                        <TabItem value="notif" icon={Bell} label="Alerts" activeColor="text-red-400" glowColor="shadow-red-500/50" />
                    </TabsList>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-hidden relative group">
                    <TabsContent value="system" className="h-full m-0 overflow-y-auto overscroll-contain p-4 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:zoom-in-95 data-[state=active]:slide-in-from-bottom-2 duration-300">
                        <SystemTab />
                    </TabsContent>
                    <TabsContent value="quick" className="h-full m-0 overflow-y-auto overscroll-contain p-4 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:zoom-in-95 data-[state=active]:slide-in-from-bottom-2 duration-300">
                        <QuickSettingsTab />
                    </TabsContent>
                    <TabsContent value="home" className="h-full m-0 overflow-y-auto overscroll-contain p-4 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:zoom-in-95 data-[state=active]:slide-in-from-bottom-2 duration-300">
                        <SmartHomeTab />
                    </TabsContent>
                    <TabsContent value="notif" className="h-full m-0 overflow-y-auto overscroll-contain p-0 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:zoom-in-95 data-[state=active]:slide-in-from-bottom-2 duration-300">
                        <NotificationsTab />
                    </TabsContent>

                    {/* Scroll Fade Overlay */}
                    <div className="absolute bottom-0 left-0 w-full h-12 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
                </div>
            </Tabs>
        </motion.div>
    );
}

function TabItem({ value, icon: Icon, activeColor, glowColor }: any) {
    return (
        <TabsTrigger
            value={value}
            className={cn(
                "h-full w-full rounded-xl transition-all duration-300 bg-transparent hover:bg-white/5 border border-transparent",
                "data-[state=active]:bg-white/10 data-[state=active]:border-white/10",
                `data-[state=active]:${activeColor} data-[state=active]:shadow-lg data-[state=active]:${glowColor}`
            )}
        >
            <Icon className="w-5 h-5" />
        </TabsTrigger>
    );
}
