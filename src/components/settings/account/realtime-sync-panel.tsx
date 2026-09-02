"use client";

/*
 * RealtimeSyncPanel — Ajustes → Cuenta y Sincronización → "Sincronización en
 * tiempo real". Interruptor + estado en vivo (conectado/último cambio/
 * dispositivo de origen) + lista compacta de neuronas (dispositivos) de la
 * cuenta. Motor: src/lib/sync/realtime-sync.ts · dispositivos:
 * src/lib/neurons/neurons.ts (misma fuente que Astraura · Neuronas).
 *
 * Defensivo y SSR-safe: sin sesión, muestra un aviso suave y el interruptor
 * queda deshabilitado (el motor ya degrada solo, pero evitamos confundir).
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Radio, Monitor, Laptop, Smartphone, Tablet, Server, Cpu, Sparkles, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { hasStarseedSession } from "@/lib/settings-sync";
import {
    getRealtimeSyncStatus,
    onRealtimeSyncStatus,
    isRealtimeSyncEnabled,
    setRealtimeSyncEnabled,
    syncNow as runSyncNow,
    getAuroraSyncSummary,
    AURORA_CONFIG_EVENT,
    SYNC_APPLY_EVENT,
    type RealtimeSyncStatus,
    type AuroraSyncSummary,
} from "@/lib/sync/realtime-sync";
import { checkRealtimeTables, type RealtimeTablesReport } from "@/lib/sync/live-signal";
import { listNeurons, NEURON_EVENT, type Neuron, type NeuronKind } from "@/lib/neurons/neurons";

const KIND_ICONS: Record<NeuronKind, typeof Monitor> = {
    desktop: Monitor, laptop: Laptop, mobile: Smartphone, tablet: Tablet, server: Server, other: Cpu,
};

const STATE_LABEL: Record<RealtimeSyncStatus["state"], string> = {
    idle: "En espera",
    connecting: "Conectando…",
    connected: "Conectado",
    error: "Error de conexión — reintentando",
    disabled: "Desactivado",
    "no-session": "Sin sesión",
};

function relativeTime(ts: number | null): string {
    if (!ts) return "todavía sin cambios";
    const diff = Date.now() - ts;
    if (diff < 5_000) return "justo ahora";
    if (diff < 60_000) return `hace ${Math.round(diff / 1000)} s`;
    if (diff < 3_600_000) return `hace ${Math.round(diff / 60_000)} min`;
    if (diff < 86_400_000) return `hace ${Math.round(diff / 3_600_000)} h`;
    return new Date(ts).toLocaleDateString();
}

export function RealtimeSyncPanel() {
    const [session, setSession] = useState<boolean | null>(null);
    const [enabled, setEnabled] = useState(true);
    const [status, setStatus] = useState<RealtimeSyncStatus>(getRealtimeSyncStatus());
    const [neurons, setNeurons] = useState<Neuron[]>([]);
    const [syncingNow, setSyncingNow] = useState(false);
    const [tables, setTables] = useState<RealtimeTablesReport | null>(null);
    const [aurora, setAurora] = useState<AuroraSyncSummary | null>(null);

    const refreshNeurons = useCallback(async () => {
        try { setNeurons(await listNeurons()); } catch { /* defensivo */ }
    }, []);

    const refreshAurora = useCallback(() => {
        try { setAurora(getAuroraSyncSummary()); } catch { /* defensivo */ }
    }, []);

    useEffect(() => {
        let alive = true;
        hasStarseedSession().then(setSession);
        setEnabled(isRealtimeSyncEnabled());
        void refreshNeurons();
        refreshAurora();
        // Diagnóstico informativo (NO condiciona el sync: el broadcast va aparte).
        checkRealtimeTables()
            .then((report) => { if (alive) setTables(report); })
            .catch(() => { /* desconocido: no pasa nada */ });
        const off = onRealtimeSyncStatus((s) => { setStatus(s); refreshAurora(); });
        const onNeuronEvent = () => { void refreshNeurons(); };
        window.addEventListener(NEURON_EVENT, onNeuronEvent);
        // La config de Aurora puede llegar de OTRO dispositivo en cualquier momento.
        window.addEventListener(AURORA_CONFIG_EVENT, refreshAurora);
        window.addEventListener(SYNC_APPLY_EVENT, refreshAurora);
        return () => {
            alive = false;
            off();
            window.removeEventListener(NEURON_EVENT, onNeuronEvent);
            window.removeEventListener(AURORA_CONFIG_EVENT, refreshAurora);
            window.removeEventListener(SYNC_APPLY_EVENT, refreshAurora);
        };
    }, [refreshNeurons, refreshAurora]);

    const toggle = useCallback((next: boolean) => {
        setEnabled(next);
        setRealtimeSyncEnabled(next);
    }, []);

    const syncNow = useCallback(async () => {
        setSyncingNow(true);
        // Baja de la cuenta (LWW: nunca pisa lo más nuevo) y sube lo de aquí.
        try { await runSyncNow(); } catch { /* noop */ }
        refreshAurora();
        setSyncingNow(false);
    }, [refreshAurora]);

    const connected = status.state === "connected";
    const dotClass = connected
        ? "bg-emerald-400"
        : status.state === "connecting" ? "bg-amber-400 animate-pulse"
            : status.state === "error" ? "bg-red-400"
                : "bg-zinc-500";

    return (
        <Card className="bg-background/40 backdrop-blur-sm border-0 shadow-none">
            <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                        <Radio className="w-5 h-5 text-primary" />
                        Sincronización en tiempo real
                    </span>
                    <Switch
                        checked={enabled && session !== false}
                        disabled={session === false}
                        onCheckedChange={toggle}
                        aria-label="Sincronización en tiempo real"
                    />
                </CardTitle>
                <CardDescription>
                    Escritorios, cursor, chats de Aurora, dock, memorias y ajustes se reflejan al instante
                    en el resto de tus dispositivos con esta cuenta. Igual que el resto de tu identidad
                    soberana: solo tú tienes acceso (RLS), y las claves API/secretos nunca viajan.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center gap-2.5 p-3 rounded-xl border border-white/5 bg-black/20 text-xs">
                    <span className={cn("w-2 h-2 rounded-full shrink-0", dotClass)} />
                    <span className="flex-1 min-w-0">
                        {session === false
                            ? "Sin sesión — inicia sesión para sincronizar entre dispositivos."
                            : STATE_LABEL[status.state]}
                        {status.lastChangeAt != null && (
                            <span className="text-muted-foreground"> · último cambio {relativeTime(status.lastChangeAt)}</span>
                        )}
                    </span>
                    {session && (
                        <button
                            type="button"
                            onClick={() => void syncNow()}
                            disabled={syncingNow || !enabled}
                            className={cn(
                                "flex items-center gap-1.5 px-2 py-1 rounded-lg border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary transition-colors cursor-pointer shrink-0",
                                (syncingNow || !enabled) && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            <RefreshCw className={cn("w-3.5 h-3.5", syncingNow && "animate-spin")} />
                            <span className="hidden sm:inline">{syncingNow ? "Sincronizando…" : "Sincronizar ahora"}</span>
                        </button>
                    )}
                </div>

                {/* Sync en vivo por BROADCAST: funciona SIN la migración de publicación
                    (`supabase_realtime`). El aviso de postgres_changes es informativo:
                    el sync no depende de él, así que nunca se muestra como error. */}
                <div className="rounded-xl border border-white/5 bg-black/20 p-3 space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                        <Radio className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                        <span className="font-medium">Sync en vivo: por broadcast</span>
                        <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-400/30 text-[9px]">Activo</Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                        Los cambios (biblioteca, publicaciones…) se anuncian por canales de tiempo real, sin
                        depender de la configuración de replicación de la base de datos.
                        {tables?.known === true && tables.missing.length > 0 && (
                            <> El camino redundante (postgres_changes) no está disponible para{" "}
                                {tables.missing.length} tabla{tables.missing.length === 1 ? "" : "s"} — funciona
                                igual por broadcast.</>
                        )}
                        {tables?.known === false && (
                            <> El estado de la replicación no es consultable desde el cliente (desconocido) — no
                                hace falta: el broadcast cubre el sync.</>
                        )}
                    </p>
                </div>

                {/* ── Aurora y Astraura: estado REAL, sin fingir (Adenda 68 · A) ── */}
                <div className="rounded-xl border border-white/5 bg-black/20 p-3 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                        <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="font-medium">Aurora y Astraura</span>
                        {session === false ? (
                            <Badge variant="outline" className="text-[9px] bg-zinc-500/10 text-zinc-400 border-zinc-500/30">
                                Solo en este dispositivo
                            </Badge>
                        ) : aurora && aurora.lastSyncAt != null ? (
                            <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-400/30 text-[9px]">
                                Sincronizado · {relativeTime(aurora.lastSyncAt)}
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-300 border-amber-400/30">
                                {connected ? "Sin cambios todavía" : "En espera"}
                            </Badge>
                        )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                        {session === false ? (
                            <>
                                Sin sesión, la configuración de Aurora vive solo aquí. Inicia sesión y viajará con
                                tu cuenta.
                            </>
                        ) : (
                            <>
                                Personalidades, perfiles de personalidad y permisos, sentidos, voz, visión, memoria,
                                capacidades instaladas y el reparto de Astraura son de <strong>ámbito cuenta</strong>:
                                se aplican al instante en {neurons.length > 0 ? `tus ${neurons.length} dispositivos` : "todos tus dispositivos"} y
                                perfiles.{" "}
                                {aurora && aurora.keysLocal > 0 && (
                                    <>Ahora mismo hay <strong>{aurora.keysLocal}</strong> ajuste{aurora.keysLocal === 1 ? "" : "s"} de
                                        Aurora en este dispositivo viajando con la cuenta.</>
                                )}
                            </>
                        )}
                    </p>
                    <p className="flex items-start gap-1.5 text-[10px] text-muted-foreground pt-0.5">
                        <ShieldCheck className="w-3 h-3 mt-0.5 text-emerald-300 shrink-0" />
                        <span>
                            Las <strong>claves y tokens</strong> de tus servicios (proveedores de IA, conectores,
                            integraciones) <strong>nunca</strong> salen de este dispositivo: se podan antes de subir
                            y se conservan aquí al aplicar la config de otro dispositivo.
                        </span>
                    </p>
                </div>

                {neurons.length > 0 && (
                    <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground px-1">
                            Dispositivos ({neurons.length})
                        </p>
                        <div className="grid gap-1.5">
                            {neurons.map((n) => {
                                const Icon = KIND_ICONS[n.kind] ?? Cpu;
                                return (
                                    <div
                                        key={n.id}
                                        className={cn(
                                            "flex items-center gap-2.5 rounded-lg border border-white/5 bg-black/20 p-2.5",
                                            n.isThisDevice && "border-primary/30 ring-1 ring-primary/20"
                                        )}
                                    >
                                        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                                        <span className="text-xs font-medium truncate flex-1 min-w-0">{n.name}</span>
                                        {n.isThisDevice && (
                                            <Badge className="bg-primary/15 text-primary border-primary/30 text-[9px] shrink-0">Este dispositivo</Badge>
                                        )}
                                        <Badge
                                            variant="outline"
                                            className={cn(
                                                "text-[9px] shrink-0",
                                                n.online ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/30" : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30"
                                            )}
                                        >
                                            <span className={cn("w-1.5 h-1.5 rounded-full mr-1", n.online ? "bg-emerald-400" : "bg-zinc-500")} />
                                            {n.online ? "Online" : "Offline"}
                                        </Badge>
                                    </div>
                                );
                            })}
                        </div>
                        <p className="text-[10px] text-muted-foreground px-1">
                            Renombra o ajusta permisos de cada dispositivo en Astraura · Neuronas.
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
