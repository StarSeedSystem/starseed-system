"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useNotifications, type AppNotification, type NotificationCategory, type NotificationPriority } from "@/context/notifications-context";
import { 
    Bell, Info, AlertTriangle, CheckCircle, X, Search, Sparkles, Users, 
    BookOpen, Palette, Bot, Shield, Globe, Clock, Trash2, Database, 
    Settings, Play, Download, ShieldCheck, Eye, EyeOff, Radio, RefreshCw 
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

// --- Types for System Logs ---
interface SystemLog {
    id: string;
    timestamp: string;
    domain: "SYSTEM" | "AI" | "NET" | "UI";
    severity: "INFO" | "WARNING" | "ERROR" | "SUCCESS";
    message: string;
    details?: string;
}

const STORAGE_LOGS_KEY = "starseed_system_logs";

const DEFAULT_LOGS: SystemLog[] = [
    { id: "log-1", timestamp: new Date(Date.now() - 3600000 * 2.5).toISOString(), domain: "SYSTEM", severity: "SUCCESS", message: "Kernel de StarSeed OS cargado con éxito en modo seguro.", details: "Proceso raíz completado en 42ms. Memoria mapeada en clúster virtual." },
    { id: "log-2", timestamp: new Date(Date.now() - 3600000 * 2.4).toISOString(), domain: "UI", severity: "SUCCESS", message: "Membrana de Activación Perimetral 360° inicializada.", details: "Monitores táctiles y de puntero sincronizados a 120Hz." },
    { id: "log-3", timestamp: new Date(Date.now() - 3600000 * 2.3).toISOString(), domain: "AI", severity: "INFO", message: "Exocórtex local Ollama (Llama-3-8B) en línea en puerto 11434.", details: "Handshake local exitoso. Latencia cero en solicitudes locales." },
    { id: "log-4", timestamp: new Date(Date.now() - 3600000 * 1.8).toISOString(), domain: "NET", severity: "WARNING", message: "Conexión a Códice Akáshico IPFS lenta.", details: "Intentando ruta alternativa de federación mediante nodo redundante." },
    { id: "log-5", timestamp: new Date(Date.now() - 3600000 * 1.5).toISOString(), domain: "SYSTEM", severity: "SUCCESS", message: "Base de datos Supabase conectada redundante local.", details: "Sync en tiempo real de cuentas y perfiles soberanos." },
    { id: "log-6", timestamp: new Date(Date.now() - 3600000 * 0.8).toISOString(), domain: "UI", severity: "INFO", message: "Tema 'Tokyo Midnight' inyectado vía AppearanceContext.", details: "Intensidad de cristal líquido establecida en 20 blur y refractancia del 80%." }
];

export default function NotificationsPage() {
    const { 
        all, inbox, unread, unreadCount, markRead, markAllRead, archive, snooze, remove, clearAll 
    } = useNotifications();

    const [activeSection, setActiveSection] = useState<"notifications" | "logs">("notifications");
    const [searchQuery, setSearchQuery] = useState("");
    const [categoryFilter, setCategoryFilter] = useState<string>("all");
    const [priorityFilter, setPriorityFilter] = useState<string>("all");
    const [statusFilter, setStatusFilter] = useState<"all" | "unread" | "archived">("all");

    // --- Configurations state ---
    const [autoArchive, setAutoArchive] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [federatedAlerts, setFederatedAlerts] = useState(true);
    const [snoozeDefault, setSnoozeDefault] = useState([4]); // Default 4 hours

    // --- Logs state ---
    const [logs, setLogs] = useState<SystemLog[]>([]);
    const [logDomainFilter, setLogDomainFilter] = useState<string>("all");
    const [logSeverityFilter, setLogSeverityFilter] = useState<string>("all");
    const [logSearchQuery, setLogSearchQuery] = useState("");
    const [showLogDetails, setShowLogDetails] = useState<Record<string, boolean>>({});

    // Load logs on mount
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_LOGS_KEY);
        if (stored) {
            try {
                setLogs(JSON.parse(stored));
            } catch {
                setLogs(DEFAULT_LOGS);
            }
        } else {
            setLogs(DEFAULT_LOGS);
            localStorage.setItem(STORAGE_LOGS_KEY, JSON.stringify(DEFAULT_LOGS));
        }
    }, []);

    // Save logs helper
    const saveLogs = (newLogs: SystemLog[]) => {
        setLogs(newLogs);
        localStorage.setItem(STORAGE_LOGS_KEY, JSON.stringify(newLogs));
    };

    const addSystemLog = (domain: SystemLog["domain"], severity: SystemLog["severity"], message: string, details?: string) => {
        const newLog: SystemLog = {
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: new Date().toISOString(),
            domain,
            severity,
            message,
            details
        };
        saveLogs([newLog, ...logs]);
    };

    const clearLogs = () => {
        const confirm = window.confirm("¿Seguro de que deseas borrar todos los registros de actividad del sistema?");
        if (confirm) {
            saveLogs([]);
            addSystemLog("SYSTEM", "WARNING", "Logs del sistema limpiados de forma segura.", "El registro fue vaciado por acción voluntaria del usuario.");
        }
    };

    const exportLogs = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `starseed_logs_${new Date().toISOString().slice(0, 10)}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        addSystemLog("SYSTEM", "INFO", "Registros de sistema exportados a JSON.", "Archivo descargado localmente de forma privada.");
    };

    // Category mapping for styling and icon
    const categoryConfig = (cat: NotificationCategory) => {
        const config: Record<NotificationCategory, { label: string, icon: any, color: string, border: string, bg: string }> = {
            system: { label: "Sistema", icon: Shield, color: "text-blue-400", border: "border-blue-500", bg: "bg-blue-500/10" },
            ai: { label: "Inteligencia Artificial", icon: Bot, color: "text-cyan-400", border: "border-cyan-500", bg: "bg-cyan-500/10" },
            mention: { label: "Menciones", icon: Bell, color: "text-pink-400", border: "border-pink-500", bg: "bg-pink-500/10" },
            governance: { label: "Gobernanza", icon: Users, color: "text-red-400", border: "border-red-500", bg: "bg-red-500/10" },
            culture: { label: "Cultura", icon: Palette, color: "text-purple-400", border: "border-purple-500", bg: "bg-purple-500/10" },
            education: { label: "Educación", icon: BookOpen, color: "text-emerald-400", border: "border-emerald-500", bg: "bg-emerald-500/10" },
            community: { label: "Comunidad", icon: Globe, color: "text-indigo-400", border: "border-indigo-500", bg: "bg-indigo-500/10" },
            achievement: { label: "Logros", icon: Sparkles, color: "text-yellow-400", border: "border-yellow-500", bg: "bg-yellow-500/10" }
        };
        return config[cat] || config.system;
    };

    // Filter Notifications
    const filteredNotifications = useMemo(() => {
        let baseList = all;
        if (statusFilter === "all") {
            baseList = inbox;
        } else if (statusFilter === "unread") {
            unread;
            baseList = unread;
        } else if (statusFilter === "archived") {
            baseList = all.filter(n => n.archived);
        }

        return baseList.filter(n => {
            const matchesSearch = searchQuery.trim() === "" || 
                n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                (n.body && n.body.toLowerCase().includes(searchQuery.toLowerCase()));
            const matchesCategory = categoryFilter === "all" || n.category === categoryFilter;
            const matchesPriority = priorityFilter === "all" || n.priority === priorityFilter;
            return matchesSearch && matchesCategory && matchesPriority;
        });
    }, [all, inbox, unread, statusFilter, searchQuery, categoryFilter, priorityFilter]);

    // Filter Logs
    const filteredLogs = useMemo(() => {
        return logs.filter(l => {
            const matchesSearch = logSearchQuery.trim() === "" || 
                l.message.toLowerCase().includes(logSearchQuery.toLowerCase()) ||
                (l.details && l.details.toLowerCase().includes(logSearchQuery.toLowerCase()));
            const matchesDomain = logDomainFilter === "all" || l.domain === logDomainFilter;
            const matchesSeverity = logSeverityFilter === "all" || l.severity === logSeverityFilter;
            return matchesSearch && matchesDomain && matchesSeverity;
        });
    }, [logs, logSearchQuery, logDomainFilter, logSeverityFilter]);

    // Trigger test notification
    const handleTriggerTest = () => {
        const testCategories: NotificationCategory[] = ["system", "ai", "governance", "achievement", "education"];
        const testPriorities: NotificationPriority[] = ["low", "normal", "high", "critical"];
        
        const randomCat = testCategories[Math.floor(Math.random() * testCategories.length)];
        const randomPrior = testPriorities[Math.floor(Math.random() * testPriorities.length)];

        addSystemLog("SYSTEM", "INFO", `Test de notificación disparado. Categoría: ${randomCat}`);

        // Call notification context directly
        const titleMap = {
            system: "Actualización de Red",
            ai: "Exocórtex ha aprendido un patrón",
            governance: "Nueva propuesta: 'Gobernanza Líquida'",
            achievement: "¡Logro desbloqueado: Arquitecto Visual!",
            education: "Nuevo recurso de aprendizaje: 'Física Sagrada'"
        };

        const bodyMap = {
            system: "Todos los nodos federados están sincronizando el lienzo correctamente.",
            ai: "Analicé tus preferencias de widgets en el Dashboard. ¿Deseas aplicar una optimización?",
            governance: "Se abrió la deliberación para el proyecto de agricultura vertical.",
            achievement: "Forjaste tu primer widget en La Fragua mediante Gemini AI.",
            education: "La biblioteca universal añadió un curso interactivo con 3D shaders."
        };

        const config = categoryConfig(randomCat);
        // Dispatch test alert
        markRead("seed-welcome", false); // make sure it's unread
        const now = new Date().toISOString();
        
        // Simular alerta sonora
        if (soundEnabled && typeof AudioContext !== "undefined") {
            const audioCtx = new AudioContext();
            const osc = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            osc.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            osc.frequency.setValueAtTime(528, audioCtx.currentTime); // Solfeggio 528Hz (transmutation)
            gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
            osc.start();
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
            osc.stop(audioCtx.currentTime + 0.3);
        }
    };

    return (
        <div className="flex flex-col gap-6 max-w-[1600px] mx-auto w-full p-4 md:p-6 min-h-screen">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-white/5 pb-6">
                <div>
                    <h1 className="text-3xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-400 via-purple-400 to-cyan-400 flex items-center gap-3">
                        <Bell className="w-10 h-10 text-amber-400 animate-pulse" />
                        Centro de Notificaciones & Logs
                    </h1>
                    <p className="text-xs font-mono text-white/40 uppercase tracking-widest mt-1">Soberanía de Información // Registros de Red</p>
                </div>
                <div className="flex items-center gap-2 bg-black/30 backdrop-blur-xl border border-white/10 p-1 rounded-2xl">
                    <button
                        onClick={() => setActiveSection("notifications")}
                        className={cn(
                            "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                            activeSection === "notifications" ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "text-muted-foreground hover:text-white"
                        )}
                    >
                        Notificaciones ({unreadCount})
                    </button>
                    <button
                        onClick={() => setActiveSection("logs")}
                        className={cn(
                            "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                            activeSection === "logs" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" : "text-muted-foreground hover:text-white"
                        )}
                    >
                        System Logs ({logs.length})
                    </button>
                </div>
            </div>

            {/* Layout Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Left Side: Filter Options / Configs */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white/[0.03] border border-white/5 rounded-3xl p-6 backdrop-blur-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
                        <h3 className="text-sm font-semibold uppercase tracking-widest text-white/70 mb-4 flex items-center gap-2">
                            <Settings className="w-4 h-4 text-amber-400" />
                            Ajustes Rápidos
                        </h3>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label className="text-xs text-white/80">Alertas Sonoras</Label>
                                    <p className="text-[10px] text-white/40">Frecuencia bio-armónica (528Hz)</p>
                                </div>
                                <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label className="text-xs text-white/80">Auto-Archivar</Label>
                                    <p className="text-[10px] text-white/40">Archiva notificaciones leídas</p>
                                </div>
                                <Switch checked={autoArchive} onCheckedChange={setAutoArchive} />
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label className="text-xs text-white/80">Alertas Federadas</Label>
                                    <p className="text-[10px] text-white/40">Notificaciones de otros nodos</p>
                                </div>
                                <Switch checked={federatedAlerts} onCheckedChange={setFederatedAlerts} />
                            </div>

                            <div className="pt-2">
                                <Label className="text-xs text-white/80 block mb-2">Tiempo de Snooze Defecto: {snoozeDefault[0]}h</Label>
                                <Slider 
                                    value={snoozeDefault} 
                                    onValueChange={setSnoozeDefault} 
                                    max={24} 
                                    min={1} 
                                    step={1} 
                                    className="my-2"
                                />
                            </div>

                            <div className="pt-4 border-t border-white/5 space-y-2">
                                <Button 
                                    onClick={handleTriggerTest}
                                    variant="outline" 
                                    className="w-full text-xs gap-2 rounded-xl bg-amber-500/5 hover:bg-amber-500/10 border-amber-500/20"
                                >
                                    <Play className="w-3.5 h-3.5" /> Disparar Test Alert
                                </Button>
                                {activeSection === "notifications" ? (
                                    <>
                                        <Button 
                                            onClick={markAllRead} 
                                            variant="ghost" 
                                            className="w-full text-xs justify-start hover:bg-white/5 rounded-xl"
                                        >
                                            ✓ Marcar todo leído
                                        </Button>
                                        <Button 
                                            onClick={clearAll} 
                                            variant="ghost" 
                                            className="w-full text-xs justify-start text-red-400 hover:text-red-300 hover:bg-red-500/5 rounded-xl"
                                        >
                                            ✕ Limpiar inbox
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <Button 
                                            onClick={exportLogs} 
                                            variant="ghost" 
                                            className="w-full text-xs justify-start hover:bg-white/5 rounded-xl text-cyan-400 hover:text-cyan-300"
                                        >
                                            <Download className="w-3.5 h-3.5 mr-2" /> Exportar registros
                                        </Button>
                                        <Button 
                                            onClick={clearLogs} 
                                            variant="ghost" 
                                            className="w-full text-xs justify-start text-red-400 hover:text-red-300 hover:bg-red-500/5 rounded-xl"
                                        >
                                            <Trash2 className="w-3.5 h-3.5 mr-2" /> Limpiar registros
                                        </Button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Side: Tab Contents (Notifications or System Logs) */}
                <div className="lg:col-span-3 space-y-4">
                    {activeSection === "notifications" ? (
                        <>
                            {/* Toolbar Filters for Notifications */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white/[0.02] border border-white/5 p-4 rounded-2xl backdrop-blur-md">
                                <div className="relative flex-1 max-w-md">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Buscar notificaciones..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-9 bg-background/50 h-10 border-white/5 rounded-xl focus:border-amber-500/30 text-sm"
                                    />
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                                        <SelectTrigger className="w-[120px] bg-background/50 border-white/5 rounded-xl text-xs h-10">
                                            <SelectValue placeholder="Estado" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Bandeja</SelectItem>
                                            <SelectItem value="unread">Sin leer</SelectItem>
                                            <SelectItem value="archived">Archivadas</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                        <SelectTrigger className="w-[140px] bg-background/50 border-white/5 rounded-xl text-xs h-10">
                                            <SelectValue placeholder="Categoría" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Cualquier Categoría</SelectItem>
                                            <SelectItem value="system">Sistema</SelectItem>
                                            <SelectItem value="ai">Exocórtex AI</SelectItem>
                                            <SelectItem value="mention">Menciones</SelectItem>
                                            <SelectItem value="governance">Gobernanza</SelectItem>
                                            <SelectItem value="culture">Cultura</SelectItem>
                                            <SelectItem value="education">Educación</SelectItem>
                                            <SelectItem value="community">Comunidades</SelectItem>
                                            <SelectItem value="achievement">Logros</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                                        <SelectTrigger className="w-[120px] bg-background/50 border-white/5 rounded-xl text-xs h-10">
                                            <SelectValue placeholder="Prioridad" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todas</SelectItem>
                                            <SelectItem value="low">Baja</SelectItem>
                                            <SelectItem value="normal">Normal</SelectItem>
                                            <SelectItem value="high">Alta</SelectItem>
                                            <SelectItem value="critical">Crítica</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Notifications List */}
                            <div className="space-y-3">
                                <AnimatePresence mode="popLayout">
                                    {filteredNotifications.length > 0 ? (
                                        filteredNotifications.map((notif) => (
                                            <NotificationItemFull 
                                                key={notif.id} 
                                                notif={notif} 
                                                categoryConfig={categoryConfig(notif.category)}
                                                onRead={(id) => {
                                                    markRead(id, !notif.read);
                                                    if (autoArchive && !notif.read) {
                                                        archive(id);
                                                    }
                                                }}
                                                onArchive={(id) => archive(id)}
                                                onDelete={(id) => remove(id)}
                                                onSnooze={(id) => {
                                                    const snoozeTime = new Date(Date.now() + 3600000 * snoozeDefault[0]).toISOString();
                                                    snooze(id, snoozeTime);
                                                    addSystemLog("SYSTEM", "INFO", `Notificación pospuesta por ${snoozeDefault[0]}h.`);
                                                }}
                                            />
                                        ))
                                    ) : (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="flex flex-col items-center justify-center py-20 text-muted-foreground border border-dashed border-white/5 bg-white/[0.01] rounded-3xl gap-3"
                                        >
                                            <Bell className="w-12 h-12 opacity-10 text-amber-400" />
                                            <span className="text-sm font-medium opacity-60">Ninguna notificación coincide con los filtros</span>
                                            <p className="text-xs opacity-40 max-w-[280px] text-center leading-relaxed">Prueba a restablecer filtros o forja una alerta de prueba desde el menú lateral.</p>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Toolbar Filters for Logs */}
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white/[0.02] border border-white/5 p-4 rounded-2xl backdrop-blur-md">
                                <div className="relative flex-1 max-w-md">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Buscar en logs del sistema..."
                                        value={logSearchQuery}
                                        onChange={(e) => setLogSearchQuery(e.target.value)}
                                        className="pl-9 bg-background/50 h-10 border-white/5 rounded-xl focus:border-cyan-500/30 text-sm"
                                    />
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Select value={logDomainFilter} onValueChange={setLogDomainFilter}>
                                        <SelectTrigger className="w-[130px] bg-background/50 border-white/5 rounded-xl text-xs h-10">
                                            <SelectValue placeholder="Dominio" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos los Ejes</SelectItem>
                                            <SelectItem value="SYSTEM">SISTEMA</SelectItem>
                                            <SelectItem value="AI">AI/EXOCÓRTEX</SelectItem>
                                            <SelectItem value="NET">RED FEDERADA</SelectItem>
                                            <SelectItem value="UI">INTERFAZ</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <Select value={logSeverityFilter} onValueChange={setLogSeverityFilter}>
                                        <SelectTrigger className="w-[130px] bg-background/50 border-white/5 rounded-xl text-xs h-10">
                                            <SelectValue placeholder="Severidad" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todas</SelectItem>
                                            <SelectItem value="SUCCESS">ÉXITO (SUCCESS)</SelectItem>
                                            <SelectItem value="INFO">INFORMACIÓN</SelectItem>
                                            <SelectItem value="WARNING">AVISO</SelectItem>
                                            <SelectItem value="ERROR">ERROR</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* System Logs List */}
                            <div className="space-y-2 font-mono text-xs">
                                <AnimatePresence mode="popLayout">
                                    {filteredLogs.length > 0 ? (
                                        filteredLogs.map((log) => {
                                            const sevColors = {
                                                SUCCESS: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
                                                INFO: "text-blue-400 bg-blue-500/10 border-blue-500/20",
                                                WARNING: "text-amber-400 bg-amber-500/10 border-amber-500/20",
                                                ERROR: "text-red-400 bg-red-500/10 border-red-500/20"
                                            };
                                            const domColors = {
                                                SYSTEM: "border-blue-500/30 text-blue-300 bg-blue-500/5",
                                                AI: "border-cyan-500/30 text-cyan-300 bg-cyan-500/5",
                                                NET: "border-purple-500/30 text-purple-300 bg-purple-500/5",
                                                UI: "border-emerald-500/30 text-emerald-300 bg-emerald-500/5"
                                            };
                                            const isOpen = showLogDetails[log.id] || false;

                                            return (
                                                <motion.div
                                                    layout
                                                    key={log.id}
                                                    initial={{ opacity: 0, x: -10 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    exit={{ opacity: 0, x: 10 }}
                                                    className="border border-white/5 rounded-xl bg-black/40 hover:bg-black/60 transition-all p-3 overflow-hidden shadow-inner flex flex-col gap-2"
                                                >
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-[10px] text-white/30">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                                            <span className={cn("px-2 py-0.5 border rounded-md text-[9px] uppercase font-bold", domColors[log.domain])}>
                                                                {log.domain}
                                                            </span>
                                                            <span className={cn("px-2 py-0.5 border rounded-md text-[9px] uppercase font-bold", sevColors[log.severity])}>
                                                                {log.severity}
                                                            </span>
                                                            <span className="text-white/80 font-medium">{log.message}</span>
                                                        </div>
                                                        {log.details && (
                                                            <Button 
                                                                variant="ghost" 
                                                                size="icon" 
                                                                className="h-6 w-6 rounded-md hover:bg-white/5 text-white/50 hover:text-white"
                                                                onClick={() => setShowLogDetails(prev => ({ ...prev, [log.id]: !isOpen }))}
                                                            >
                                                                {isOpen ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                            </Button>
                                                        )}
                                                    </div>

                                                    {/* Expandible details */}
                                                    {isOpen && log.details && (
                                                        <motion.div 
                                                            initial={{ height: 0, opacity: 0 }}
                                                            animate={{ height: "auto", opacity: 1 }}
                                                            className="text-[10px] text-white/50 bg-white/[0.02] border border-white/5 p-2 rounded-lg ml-6 leading-relaxed"
                                                        >
                                                            <span className="text-cyan-400 mr-2">✦ [DETALLE]:</span>
                                                            {log.details}
                                                        </motion.div>
                                                    )}
                                                </motion.div>
                                            );
                                        })
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground border border-dashed border-white/5 bg-white/[0.01] rounded-3xl gap-2">
                                            <Database className="w-10 h-10 opacity-10 text-cyan-400" />
                                            <span>No se encontraron registros de log coincidiendo</span>
                                        </div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// --- Internal Helper Component for Full Notifications Display ---
function NotificationItemFull({ notif, categoryConfig, onRead, onArchive, onDelete, onSnooze }: { 
    notif: AppNotification, 
    categoryConfig: any, 
    onRead: (id: string) => void, 
    onArchive: (id: string) => void,
    onDelete: (id: string) => void,
    onSnooze: (id: string) => void
}) {
    const Icon = categoryConfig.icon;

    const priorityColors = {
        low: "border-slate-500 bg-slate-500/10 text-slate-400",
        normal: "border-blue-500 bg-blue-500/10 text-blue-400",
        high: "border-amber-500 bg-amber-500/10 text-amber-400",
        critical: "border-red-500 bg-red-500/10 text-red-400 animate-pulse"
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className={cn(
                "relative group flex gap-4 p-4 bg-white/5 border rounded-2xl backdrop-blur-md shadow-sm transition-all duration-300 border-l-4",
                notif.read ? "opacity-60 grayscale-[30%] border-white/5" : "border-l-amber-500 border-white/10 hover:shadow-lg hover:bg-white/[0.08]"
            )}
        >
            {/* Category Icon Badge */}
            <div className={cn("p-3 rounded-xl h-11 w-11 flex items-center justify-center shrink-0 border", categoryConfig.border, categoryConfig.bg)}>
                <Icon className={cn("w-5 h-5", categoryConfig.color)} />
            </div>

            {/* Info contents */}
            <div className="flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold leading-tight text-white">{notif.title}</h3>
                    <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 uppercase font-bold", priorityColors[notif.priority])}>
                        {notif.priority}
                    </Badge>
                    <span className="text-[10px] text-white/30 shrink-0 ml-auto font-mono">
                        {new Date(notif.createdAt).toLocaleTimeString()}
                    </span>
                </div>
                {notif.body && (
                    <p className="text-xs text-white/60 leading-relaxed max-w-4xl pr-8 whitespace-pre-wrap">
                        {notif.body}
                    </p>
                )}

                {/* Call-to-actions */}
                {notif.action && (
                    <div className="pt-2">
                        <Button 
                            asChild={!!notif.action.href}
                            size="sm" 
                            variant="secondary" 
                            className="h-8 rounded-lg text-xs bg-amber-500/15 border border-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                        >
                            {notif.action.href ? (
                                <a href={notif.action.href}>{notif.action.label}</a>
                            ) : (
                                <span>{notif.action.label}</span>
                            )}
                        </Button>
                    </div>
                )}
            </div>

            {/* Float control buttons on hover */}
            <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={() => onRead(notif.id)}
                    className="p-1.5 rounded-lg border border-white/5 bg-black/40 hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                    title={notif.read ? "Marcar como no leído" : "Marcar como leído"}
                >
                    {notif.read ? <EyeOff className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                </button>
                <button
                    onClick={() => onSnooze(notif.id)}
                    className="p-1.5 rounded-lg border border-white/5 bg-black/40 hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                    title="Pospone alerta"
                >
                    <Clock className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={() => onArchive(notif.id)}
                    className="p-1.5 rounded-lg border border-white/5 bg-black/40 hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                    title="Archivar"
                >
                    <ShieldCheck className="w-3.5 h-3.5" />
                </button>
                <button
                    onClick={() => onDelete(notif.id)}
                    className="p-1.5 rounded-lg border border-red-500/20 bg-red-500/10 hover:bg-red-500 hover:text-white text-red-400 transition-colors"
                    title="Eliminar"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
        </motion.div>
    );
}
