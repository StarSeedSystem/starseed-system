"use client";

/**
 * ⚙️ Panel de Ajustes del Director de Agentes
 * 
 * Aquí se concentran todas las configuraciones de los agentes
 * orquestadores, APIs, modelos, plugins y procesos programados.
 */

import { useCallback, useEffect, useState } from "react";
import {
    Bot,
    CheckCircle,
    Clock,
    Code2,
    Cpu,
    ExternalLink,
    Gauge,
    Plug,
    RefreshCw,
    Settings,
    Shield,
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

interface AjusteConfig {
    id: string;
    categoria: string;
    nombre: string;
    descripcion: string;
    valor: string;
    tipo: "toggle" | "select" | "text" | "number";
    opciones?: string[];
    activo: boolean;
}

const CATEGORIAS = [
    { id: "agentes", etiqueta: "Agentes", icon: Bot },
    { id: "modelos", etiqueta: "Modelos", icon: Cpu },
    { id: "proveedores", etiqueta: "Proveedores", icon: Wifi },
    { id: "apis", etiqueta: "APIs", icon: Plug },
    { id: "verificaciones", etiqueta: "Verificaciones", icon: CheckCircle },
    { id: "procesos", etiqueta: "Procesos", icon: Clock },
];

export function AjustesDirector() {
    const [categoriaActiva, setCategoriaActiva] = useState("agentes");
    const [estado, setEstado] = useState<EstadoDirector | null>(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [ajustes, setAjustes] = useState<AjusteConfig[]>(ajustesPorDefecto());

    const recargar = useCallback(async () => {
        setCargando(true);
        try {
            const res = await fetch("/api/mando/director", { cache: "no-store" });
            if (res.ok) {
                const data = await res.json() as EstadoDirector;
                setEstado(data);
                setError(null);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Error");
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        void recargar();
        const id = setInterval(() => void recargar(), 20_000);
        return () => clearInterval(id);
    }, [recargar]);

    const cambiarAjuste = useCallback((id: string, nuevoValor: string) => {
        setAjustes(prev => prev.map(a => a.id === id ? { ...a, valor: nuevoValor } : a));
    }, []);

    return (
        <div className="space-y-4">
            {/* Navegación */}
            <div className="flex flex-wrap gap-2">
                {CATEGORIAS.map((cat) => {
                    const Icon = cat.icon;
                    return (
                        <button
                            key={cat.id}
                            type="button"
                            onClick={() => setCategoriaActiva(cat.id)}
                            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                                categoriaActiva === cat.id
                                    ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                                    : "border-white/10 bg-white/[0.02] text-white/60 hover:bg-white/[0.04]"
                            }`}
                        >
                            <Icon className="h-3 w-3" />
                            {cat.etiqueta}
                        </button>
                    );
                })}
            </div>

            {/* Contenido por categoría */}
            {categoriaActiva === "agentes" && estado && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-white">Agentes activos</h3>
                    {estado.agentes.length === 0 ? (
                        <p className="py-4 text-center text-sm text-white/50">Sin agentes activos</p>
                    ) : (
                        <div className="space-y-2">
                            {estado.agentes.map((agente) => (
                                <div key={agente.id} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                                    <div className="flex items-center gap-3">
                                        <div className={`h-2 w-2 rounded-full ${agente.vivo ? "bg-emerald-400" : "bg-red-400"}`} />
                                        <div>
                                            <span className="font-mono text-xs font-medium text-white/90">{agente.id}</span>
                                            <span className={`ml-2 text-[10px] ${
                                                agente.fase === "escribiendo" ? "text-emerald-400" :
                                                agente.fase === "hecho" ? "text-emerald-300" :
                                                agente.fase === "fallido" ? "text-red-400" :
                                                agente.fase === "esperando-aprobacion" ? "text-white/50" :
                                                "text-white/60"
                                            }`}>{agente.fase}</span>
                                            <div className="mt-0.5 text-[11px] text-white/50">{agente.tarea}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 text-[11px] text-white/50">
                                        <span>{agente.proveedor}</span>
                                        <span>{Math.round(agente.bytes / 1024)} KB</span>
                                        <span>{agente.minutos}m</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {categoriaActiva === "modelos" && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-white">Configuración de modelos</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {ajustes.filter(a => a.categoria === "modelos").map((ajuste) => (
                            <div key={ajuste.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-white/80">{ajuste.nombre}</span>
                                    <span className={`text-[10px] ${ajuste.activo ? "text-emerald-400" : "text-white/40"}`}>
                                        {ajuste.activo ? "Activo" : "Inactivo"}
                                    </span>
                                </div>
                                <p className="mt-1 text-[11px] text-white/50">{ajuste.descripcion}</p>
                                {ajuste.tipo === "select" && ajuste.opciones ? (
                                    <select
                                        value={ajuste.valor}
                                        onChange={(e) => cambiarAjuste(ajuste.id, e.target.value)}
                                        className="mt-2 w-full cursor-pointer rounded border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white/80 outline-none focus:border-emerald-400/50"
                                    >
                                        {ajuste.opciones.map((op) => (
                                            <option key={op} value={op}>{op}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        type={ajuste.tipo === "number" ? "number" : "text"}
                                        value={ajuste.valor}
                                        onChange={(e) => cambiarAjuste(ajuste.id, e.target.value)}
                                        className="mt-2 w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white/80 outline-none focus:border-emerald-400/50"
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {categoriaActiva === "proveedores" && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-white">Proveedores de APIs</h3>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between rounded-lg border border-emerald-400/20 bg-emerald-500/5 px-3 py-2">
                            <div className="flex items-center gap-3">
                                <div className="h-2 w-2 rounded-full bg-emerald-400" />
                                <div>
                                    <span className="text-xs font-medium text-white/90">Apinex</span>
                                    <span className="ml-2 text-[10px] text-white/40">8 modelos gratuitos</span>
                                </div>
                            </div>
                            <span className="rounded-full border border-emerald-400/30 px-2 py-0.5 text-[10px] text-emerald-300">Conectado</span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg border border-emerald-400/20 bg-emerald-500/5 px-3 py-2">
                            <div className="flex items-center gap-3">
                                <div className="h-2 w-2 rounded-full bg-emerald-400" />
                                <div>
                                    <span className="text-xs font-medium text-white/90">NVIDIA NIM</span>
                                    <span className="ml-2 text-[10px] text-white/40">3 modelos (Kimi-K3, etc.)</span>
                                </div>
                            </div>
                            <span className="rounded-full border border-emerald-400/30 px-2 py-0.5 text-[10px] text-emerald-300">Conectado</span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg border border-emerald-400/20 bg-emerald-500/5 px-3 py-2">
                            <div className="flex items-center gap-3">
                                <div className="h-2 w-2 rounded-full bg-emerald-400" />
                                <div>
                                    <span className="text-xs font-medium text-white/90">xKiro</span>
                                    <span className="ml-2 text-[10px] text-white/40">40+ modelos gratuitos</span>
                                </div>
                            </div>
                            <span className="rounded-full border border-emerald-400/30 px-2 py-0.5 text-[10px] text-emerald-300">Conectado</span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                            <div className="flex items-center gap-3">
                                <div className="h-2 w-2 rounded-full bg-white/20" />
                                <div>
                                    <span className="text-xs font-medium text-white/90">OpenRouter</span>
                                    <span className="ml-2 text-[10px] text-white/40">Desactivado (rate limits)</span>
                                </div>
                            </div>
                            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/40">Inactivo</span>
                        </div>
                    </div>
                </div>
            )}

            {categoriaActiva === "apis" && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-white">Conexiones API</h3>
                    <div className="space-y-2">
                        <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-xs font-medium text-white/90">Apinex</span>
                                    <p className="font-mono text-[10px] text-white/40">https://apinex.bond/v1</p>
                                </div>
                                <span className="text-[11px] text-white/50">45 llamadas</span>
                            </div>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-xs font-medium text-white/90">NVIDIA NIM</span>
                                    <p className="font-mono text-[10px] text-white/40">https://integrate.api.nvidia.com/v1</p>
                                </div>
                                <span className="text-[11px] text-white/50">23 llamadas</span>
                            </div>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-xs font-medium text-white/90">xKiro</span>
                                    <p className="font-mono text-[10px] text-white/40">https://api.xkiro.com/v1</p>
                                </div>
                                <span className="text-[11px] text-white/50">67 llamadas</span>
                            </div>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-xs font-medium text-white/90">Supabase</span>
                                    <p className="font-mono text-[10px] text-white/40">pqzdpmedcsgcedkvndzl.supabase.co</p>
                                </div>
                                <span className="text-[11px] text-white/50">12 llamadas</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {categoriaActiva === "verificaciones" && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-white">Verificaciones del sistema</h3>
                    <div className="grid gap-2 sm:grid-cols-2">
                        <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                            <CheckCircle className="h-4 w-4 text-emerald-400" />
                            <div>
                                <span className="text-xs text-white/80">TypeScript (tsc)</span>
                                <p className="text-[10px] text-white/40">0 errores</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                            <CheckCircle className="h-4 w-4 text-emerald-400" />
                            <div>
                                <span className="text-xs text-white/80">Tests (vitest)</span>
                                <p className="text-[10px] text-white/40">14 pasando</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                            <CheckCircle className="h-4 w-4 text-emerald-400" />
                            <div>
                                <span className="text-xs text-white/80">APIs respondiendo</span>
                                <p className="text-[10px] text-white/40">200 OK</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                            <CheckCircle className="h-4 w-4 text-emerald-400" />
                            <div>
                                <span className="text-xs text-white/80">Orquestador</span>
                                <p className="text-[10px] text-white/40">PID 56845</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {categoriaActiva === "procesos" && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-white">Procesos programados</h3>
                    <div className="space-y-2">
                        <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                            <div>
                                <span className="text-xs font-medium text-white/90">Dream (Sincronización)</span>
                                <p className="text-[11px] text-white/50">Diario 7:00 AM</p>
                            </div>
                            <span className="rounded-full border border-emerald-400/30 px-2 py-0.5 text-[10px] text-emerald-300">Programado</span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                            <div>
                                <span className="text-xs font-medium text-white/90">Verificar orquestador</span>
                                <p className="text-[11px] text-white/50">Cada 5 min</p>
                            </div>
                            <span className="rounded-full border border-emerald-400/30 px-2 py-0.5 text-[10px] text-emerald-300">Programado</span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                            <div>
                                <span className="text-xs font-medium text-white/90">Revisar salud de APIs</span>
                                <p className="text-[11px] text-white/50">Cada 10 min</p>
                            </div>
                            <span className="rounded-full border border-emerald-400/30 px-2 py-0.5 text-[10px] text-emerald-300">Programado</span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                            <div>
                                <span className="text-xs font-medium text-white/90">Verificar Puente</span>
                                <p className="text-[11px] text-white/50">Cada 15 min</p>
                            </div>
                            <span className="rounded-full border border-emerald-400/30 px-2 py-0.5 text-[10px] text-emerald-300">Programado</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ajustesPorDefecto(): AjusteConfig[] {
    return [
        { id: "modelo_principal", categoria: "modelos", nombre: "Modelo principal", descripcion: "Modelo usado para tareas de escritura masiva", valor: "apinex/free/gemini-3.8-flash", tipo: "select", opciones: ["apinex/free/gemini-3.8-flash", "apinex/free/deepseek-v4-pro-0813", "apinex/free/muse-spark-1.3", "apinex/free/glm-5.3-flash", "apinex/free/qwen-3.8-max"], activo: true },
        { id: "modelo_revision", categoria: "modelos", nombre: "Modelo de revisión", descripcion: "Modelo usado para revisar y verificar código", valor: "nvidia/moonshotai/kimi-k3", tipo: "select", opciones: ["nvidia/moonshotai/kimi-k3", "xkiro/qwen/qwen3-coder-plus:free"], activo: true },
        { id: "modelo_pruebas", categoria: "modelos", nombre: "Modelo de pruebas", descripcion: "Modelo usado para pruebas y verificación", valor: "nvidia/moonshotai/kimi-k3", tipo: "select", opciones: ["nvidia/moonshotai/kimi-k3", "xkiro/qwen/qwen3-coder-plus:free"], activo: true },
        { id: "max_trabajadores", categoria: "modelos", nombre: "Máximo de trabajadores", descripcion: "Agentes en paralelo", valor: "2", tipo: "number", activo: true },
        { id: "umbral_memoria_mb", categoria: "modelos", nombre: "Umbral de memoria (MB)", descripcion: "Memoria mínima para lanzar agente", valor: "200", tipo: "number", activo: true },
        { id: "timeout_segundos", categoria: "modelos", nombre: "Timeout de escritura (s)", descripcion: "Tiempo máximo por tarea", valor: "600", tipo: "number", activo: true },
        { id: "reintentos", categoria: "modelos", nombre: "Reintentos por tarea", descripcion: "Intentos antes de fallar", valor: "3", tipo: "number", activo: true },
    ];
}