"use client";

/**
 * 🎛️ Director de Agentes · Panel de orquestación multiagentica
 * 
 * Muestra todos los agentes activos con acceso a:
 * - Estado en tiempo real (progreso, bytes, fase)
 * - Modelo y proveedor asignados
 * - Verificaciones y comprobaciones
 * - Commits realizados
 * - Sugerencias de enrutamiento
 * - APIs y modelos preferenciales
 * - Procesos automáticos y programados
 * - Habilidades, plugins, MCPs conectados
 */

import { useCallback, useEffect, useState } from "react";
import {
    Bot,
    CheckCircle,
    CircleDashed,
    Clock,
    Code2,
    Cpu,
    ExternalLink,
    Gauge,
    Play,
    Plug,
    RefreshCw,
    Settings,
    Wifi,
    XCircle,
    Zap,
} from "lucide-react";

interface AgenteDirector {
    id: string;
    nombre: string;
    fase: string;
    modelo: string;
    proveedor: string;
    ola: string;
    tarea: string;
    bytes: number;
    minutos: number;
    intento: number;
    quietoSegundos: number;
    rpm: number;
    vivo: boolean;
    commits: number;
    verificaciones: number;
    mcpConectados: number;
    pluginsActivos: number;
}

interface EstadoDirector {
    agentes: AgenteDirector[];
    totalColas: number;
    tareasEjecutables: number;
    tareasHechas: number;
    tareasPendientes: number;
    tareasBloqueadas: number;
    olasActivas: string[];
    proveedoresVivos: number;
    apinexDisponible: boolean;
}

const TONOS_FASE: Record<string, string> = {
    escribiendo: "text-emerald-400",
    tsc: "text-sky-400",
    tests: "text-sky-400",
    revision: "text-amber-400",
    integrando: "text-violet-400",
    "esperando-aprobacion": "text-white/50",
    "esperando-memoria": "text-orange-400",
    hecho: "text-emerald-300",
    bloqueado: "text-red-400",
    fallido: "text-red-500",
    colgado: "text-red-400",
};

function tonoFase(fase: string): string {
    return TONOS_FASE[fase] ?? "text-white/60";
}

function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${className}`}>
            {children}
        </span>
    );
}

function AgenteFila({ agente }: { agente: AgenteDirector }) {
    const [expandido, setExpandido] = useState(false);
    return (
        <div className={`rounded-lg border border-white/5 bg-white/[0.02] transition-all hover:border-white/10 ${expandido ? "ring-1 ring-white/10" : ""}`}>
            {/* Fila principal */}
            <button
                type="button"
                onClick={() => setExpandido(!expandido)}
                className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-white/[0.02]"
            >
                <div className="flex items-center gap-3">
                    <div className="relative">
                        {agente.vivo ? (
                            <Bot className="h-4 w-4 text-emerald-400" />
                        ) : (
                            <XCircle className="h-4 w-4 text-red-400" />
                        )}
                        {agente.quietoSegundos > 300 && (
                            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500" />
                        )}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-medium text-white/90">{agente.id}</span>
                            <span className={`text-[11px] ${tonoFase(agente.fase)}`}>{agente.fase}</span>
                        </div>
                        <div className="mt-0.5 text-[11px] text-white/50 truncate max-w-[300px]">
                            {agente.tarea}
                        </div>
                    </div>
                </div>
                
                <div className="flex items-center gap-4 text-[11px]">
                    <div className="hidden items-center gap-1 text-white/60 sm:flex">
                        <Cpu className="h-3 w-3" />
                        {agente.modelo.split("/").pop()}
                    </div>
                    <div className="hidden items-center gap-1 text-white/50 md:flex">
                        {agente.proveedor}
                    </div>
                    <div className="flex items-center gap-1 text-white/60">
                        <Gauge className="h-3 w-3" />
                        {Math.round(agente.bytes / 1024)} KB
                    </div>
                    <div className="flex items-center gap-1 text-white/50">
                        <Clock className="h-3 w-3" />
                        {agente.minutos}m
                    </div>
                    <div className="hidden items-center gap-1 text-white/40 md:flex">
                        {agente.rpm} rpm
                    </div>
                    <div className="flex items-center gap-1 text-white/40">
                        <CheckCircle className="h-3 w-3" />
                        {agente.commits}
                    </div>
                </div>
            </button>
            
            {/* Panel expandido */}
            {expandido && (
                <div className="border-t border-white/5 bg-black/20 px-3 py-3">
                    <div className="grid grid-cols-2 gap-4 text-[11px] md:grid-cols-4">
                        <div>
                            <span className="text-white/40">Modelo completo</span>
                            <p className="mt-0.5 font-mono text-white/80">{agente.modelo}</p>
                        </div>
                        <div>
                            <span className="text-white/40">Proveedor</span>
                            <p className="mt-0.5 text-white/80">{agente.proveedor}</p>
                        </div>
                        <div>
                            <span className="text-white/40">Ola</span>
                            <p className="mt-0.5 text-white/80">{agente.ola}</p>
                        </div>
                        <div>
                            <span className="text-white/40">Intento</span>
                            <p className="mt-0.5 text-white/80">{agente.intento}</p>
                        </div>
                        <div>
                            <span className="text-white/40">Verificaciones</span>
                            <p className="mt-0.5 text-white/80">{agente.verificaciones}</p>
                        </div>
                        <div>
                            <span className="text-white/40">MCP conectados</span>
                            <p className="mt-0.5 text-white/80">{agente.mcpConectados}</p>
                        </div>
                        <div>
                            <span className="text-white/40">Plugins activos</span>
                            <p className="mt-0.5 text-white/80">{agente.pluginsActivos}</p>
                        </div>
                        <div>
                            <span className="text-white/40">Quieto (segundos)</span>
                            <p className={`mt-0.5 ${agente.quietoSegundos > 300 ? "text-red-400" : "text-white/80"}`}>
                                {agente.quietoSegundos}s
                            </p>
                        </div>
                    </div>
                    
                    {/* Acciones */}
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" className="cursor-pointer rounded-md border border-emerald-400/30 px-2 py-1 text-[10px] text-emerald-300 hover:bg-emerald-400/10">
                            <Zap className="mr-1 inline h-3 w-3" /> Reasignar
                        </button>
                        <button type="button" className="cursor-pointer rounded-md border border-sky-400/30 px-2 py-1 text-[10px] text-sky-300 hover:bg-sky-400/10">
                            <RefreshCw className="mr-1 inline h-3 w-3" /> Reiniciar
                        </button>
                        <button type="button" className="cursor-pointer rounded-md border border-amber-400/30 px-2 py-1 text-[10px] text-amber-300 hover:bg-amber-400/10">
                            <Settings className="mr-1 inline h-3 w-3" /> Configurar
                        </button>
                        <button type="button" className="cursor-pointer rounded-md border border-red-400/30 px-2 py-1 text-[10px] text-red-300 hover:bg-red-400/10">
                            <XCircle className="mr-1 inline h-3 w-3" /> Detener
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export function DirectorAgentes() {
    const [estado, setEstado] = useState<EstadoDirector | null>(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    const recargar = useCallback(async () => {
        setCargando(true);
        try {
            const res = await fetch("/api/mando/director", { cache: "no-store" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json() as EstadoDirector;
            setEstado(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Error desconocido");
        } finally {
            setCargando(false);
        }
    }, []);
    
    useEffect(() => {
        void recargar();
        const id = setInterval(() => void recargar(), 20_000);
        return () => clearInterval(id);
    }, [recargar]);
    
    if (cargando && !estado) {
        return (
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-white/60">
                <CircleDashed className="h-4 w-4 animate-spin" />
                Cargando director de agentes...
            </div>
        );
    }
    
    if (error || !estado) {
        return (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                {error ?? "Sin datos del director."}
                <button onClick={() => void recargar()} className="ml-3 cursor-pointer rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/5">
                    <RefreshCw className="mr-1 inline h-3 w-3" /> Reintentar
                </button>
            </div>
        );
    }
    
    const { agentes } = estado;
    const agentesVivos = agentes.filter((a) => a.vivo);
    const agentesColgados = agentes.filter((a) => a.quietoSegundos > 300);
    
    return (
        <div className="space-y-4">
            {/* Resumen */}
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
                <div className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                    <div className="flex items-center justify-between">
                        <h3 className="text-[10px] font-medium uppercase tracking-wide text-white/50">Agentes vivos</h3>
                        <Wifi className="h-3 w-3 text-emerald-400" />
                    </div>
                    <p className="mt-1 text-2xl font-bold text-white">{agentesVivos.length}</p>
                    <p className="text-[10px] text-white/40">{agentes.length} total</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                    <div className="flex items-center justify-between">
                        <h3 className="text-[10px] font-medium uppercase tracking-wide text-white/50">Colgados</h3>
                        <Zap className="h-3 w-3 text-red-400" />
                    </div>
                    <p className="mt-1 text-2xl font-bold text-red-400">{agentesColgados.length}</p>
                    <p className="text-[10px] text-white/40">{"> 300s sin bytes"}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                    <div className="flex items-center justify-between">
                        <h3 className="text-[10px] font-medium uppercase tracking-wide text-white/50">Tareas ejecutables</h3>
                        <Play className="h-3 w-3 text-sky-400" />
                    </div>
                    <p className="mt-1 text-2xl font-bold text-white">{estado.tareasEjecutables}</p>
                    <p className="text-[10px] text-white/40">de {estado.tareasPendientes} pendientes</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                    <div className="flex items-center justify-between">
                        <h3 className="text-[10px] font-medium uppercase tracking-wide text-white/50">Colas activas</h3>
                        <Code2 className="h-3 w-3 text-violet-400" />
                    </div>
                    <p className="mt-1 text-2xl font-bold text-white">{estado.totalColas}</p>
                    <p className="text-[10px] text-white/40">{estado.olasActivas.length} olas</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                    <div className="flex items-center justify-between">
                        <h3 className="text-[10px] font-medium uppercase tracking-wide text-white/50">Hechas</h3>
                        <CheckCircle className="h-3 w-3 text-emerald-400" />
                    </div>
                    <p className="mt-1 text-2xl font-bold text-emerald-400">{estado.tareasHechas}</p>
                    <p className="text-[10px] text-white/40">{estado.tareasBloqueadas} bloqueadas</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                    <div className="flex items-center justify-between">
                        <h3 className="text-[10px] font-medium uppercase tracking-wide text-white/50">Proveedores</h3>
                        <Plug className="h-3 w-3 text-amber-400" />
                    </div>
                    <p className="mt-1 text-2xl font-bold text-white">{estado.proveedoresVivos}</p>
                    <p className="text-[10px] text-white/40">
                        {estado.apinexDisponible ? "Apinex ✓" : "Apinex ✗"}
                    </p>
                </div>
            </div>
            
            {/* Lista de agentes */}
            <div className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">Agentes en vivo</h3>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void recargar()}
                            className="cursor-pointer rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/60 hover:bg-white/5"
                        >
                            <RefreshCw className="mr-1 inline h-3 w-3" /> Actualizar
                        </button>
                        <button
                            type="button"
                            className="cursor-pointer rounded-md border border-emerald-400/30 px-2 py-1 text-[11px] text-emerald-300 hover:bg-emerald-400/10"
                        >
                            <Zap className="mr-1 inline h-3 w-3" /> Lanzar agentes
                        </button>
                    </div>
                </div>
                
                {agentes.length === 0 ? (
                    <p className="py-4 text-center text-sm text-white/50">
                        No hay agentes activos. Esperando latidos del orquestador...
                    </p>
                ) : (
                    <div className="space-y-2">
                        {agentes.map((agente) => (
                            <AgenteFila key={agente.id} agente={agente} />
                        ))}
                    </div>
                )}
            </div>
            
            {/* Olas activas */}
            <div className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                <h3 className="mb-2 text-sm font-semibold text-white">Olas activas</h3>
                <div className="flex flex-wrap gap-2">
                    {estado.olasActivas.length === 0 ? (
                        <p className="text-xs text-white/40">Sin olas activas</p>
                    ) : (
                        estado.olasActivas.map((ola) => (
                            <Chip key={ola} className="border-white/10 bg-white/[0.04] text-white/60">
                                {ola}
                            </Chip>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}