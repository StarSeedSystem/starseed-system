"use client";
import React from "react";
import { Bell, Info, AlertTriangle, CheckCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export function NotificationsTab() {
    // Mock notifications state
    const [notifications, setNotifications] = React.useState([
        { id: 1, title: "System Update", desc: "StarSeed OS v2.1 is ready to install.", type: "info", time: "2m ago" },
        { id: 2, title: "Security Alert", desc: "Unusual login attempt blocked.", type: "alert", time: "15m ago" },
        { id: 3, title: "Backup Complete", desc: "Network data synced successfully.", type: "success", time: "1h ago" },
        { id: 4, title: "New Connection", desc: "Venus Protocol requested access.", type: "info", time: "2h ago" },
    ]);

    const removeNotif = (id: number) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    };

    return (
        <div className="space-y-4 min-h-full">
            <div className="px-4 py-2 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Recent Activity</span>
                <button onClick={() => setNotifications([])} className="text-xs text-primary hover:text-primary/80 transition-colors">
                    Clear All
                </button>
            </div>

            <div className="px-2 pb-4 space-y-2">
                <AnimatePresence mode="popLayout">
                    {notifications.length > 0 ? (
                        notifications.map((notif) => (
                            <NotificationItem key={notif.id} data={notif} onDismiss={() => removeNotif(notif.id)} />
                        ))
                    ) : (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2"
                        >
                            <Bell className="w-8 h-8 opacity-20" />
                            <span className="text-xs">No new notifications</span>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

function NotificationItem({ data, onDismiss }: any) {
    const typeStyles: any = {
        info: { icon: Info, color: "text-blue-400", border: "border-l-blue-500", bg: "hover:bg-blue-500/5" },
        alert: { icon: AlertTriangle, color: "text-red-400", border: "border-l-red-500", bg: "hover:bg-red-500/5" },
        success: { icon: CheckCircle, color: "text-emerald-400", border: "border-l-emerald-500", bg: "hover:bg-emerald-500/5" },
    };

    const style = typeStyles[data.type] || typeStyles.info;
    const Icon = style.icon;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className={cn(
                "relative flex gap-3 p-3 bg-white/5 border border-white/5 rounded-lg transition-colors group cursor-default",
                "border-l-2",
                style.border,
                style.bg
            )}
        >
            <div className={cn("mt-1", style.color)}>
                <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 space-y-1">
                <div className="flex justify-between items-start">
                    <h4 className="text-sm font-medium leading-none">{data.title}</h4>
                    <span className="text-[10px] text-muted-foreground">{data.time}</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                    {data.desc}
                </p>
            </div>

            <button
                onClick={onDismiss}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-white"
            >
                <X className="w-3 h-3" />
            </button>
        </motion.div>
    );
}
