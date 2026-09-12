"use client";

/**
 * ⚙️ Panel de Ajustes del Director de Agentes — Ampliado
 *
 * Múltiples agentes directores especializados con:
 * - Encendido/apagado global y por director
 * - Enrutamiento automático de APIs con detección de capacidad
 * - Solución inteligente de errores (reintentos, reasignación, fallback)
 * - Contextos e instrucciones configurables por director
 * - Monitoreo de recursos (RAM, APIs, cuotas)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
    Bot, CheckCircle, Clock, Cpu, ExternalLink, Gauge, Plug, RefreshCw,
    Settings, Shield, Wifi, XCircle, Zap, Power, AlertTriangle, Play,
    Square, RotateCcw, ArrowUpDown, BarChart3, ChevronDown, ChevronUp,
    Copy, Trash2, Plus, Minus, Activity, TrendingUp, Code2,
} from "lucide-react";

// ── Tipos ──────────────────────────────────────────────────────────────────

interface AgenteDirector {
    id: string; nombre: string; fase: string; modelo: string;
    proveedor: string; ola: string; tarea: string; bytes: number;
    minutos: number; intento: number; quietoSegundos: number;
    rpm: number; vivo: boolean; commits: number;
    verificaciones: number; mcpConectados: number; pluginsActivos: number;
}

interface EstadoDirector {
    agentes: AgenteDirector[];
    totalColas: number; tareasEjecutables: number; tareasHechas: number;
    tareasPendientes: number; tareasBloqueadas: number;
    olasActivas: string[]; proveedoresVivos: number; apinexDisponible: boolean;
}

interface AjusteConfig {
    id: string; categoria: string; nombre: string; descripcion: string;
    valor: string; tipo: "toggle" | "select" | "text" | "number" | "textarea";
    opciones?: string[]; activo: boolean; lectura?: boolean;
}

type EstadoDirectorType = "detenido" | "arrancando" | "activo" | "error" | "pausado";

interface DirectorEspecializado {
    id: string;
    nombre: string;
    descripcion: string;
    icono: string;
    activo: boolean;
    modeloPreferido: string;
    modeloAlternativo: string;
    apisHabilitadas: string[];
    maxConcurrentes: number;
    timeoutSegundos: number;
    reintentos: number;
    contexto: string;
    instrucciones: string;
    encendidoAuto: boolean;
    solucionErrores: boolean;
    rebalanceoAutomatico: boolean;
    historialAcciones: string[];
    ultimaAccion: string;
    estado: EstadoDirectorType;
}

interface ProveedorAPI {
    id: string;
    nombre: string;
    url: string;
    modelos: string[];
    estado: "conectado" | "desconectado" | "rate-limit" | "timeout" | "error";
    llamadasHoy: number;
    limiteDiario?: number;
    cuotaDesconocida: boolean;
    preferente: boolean;
    automatico: boolean;
}

// ── Datos por defecto ──────────────────────────────────────────────────────

const FLOTA_APIS: ProveedorAPI[] = [
    { id: "apinex", nombre: "Apinex", url: "https://apinex.bond/v1", estado: "conectado" as const,
      modelos: ["gemini-3.8-flash", "muse-spark-1.3", "glm-5.3-flash", "deepseek-v4-flash-0731", "deepseek-v4-pro-0813", "qwen-3.8-max", "gpt-5.6-luna", "gemini-3.1-pro"],
      llamadasHoy: 45, cuotaDesconocida: false, preferente: true, automatico: true },
    { id: "nvidia-nim", nombre: "NVIDIA NIM", url: "https://integrate.api.nvidia.com/v1", estado: "conectado" as const,
      modelos: ["kimi-k3", "deepseek-ai/deepseek-v4", "nemotron-3-ultra"],
      llamadasHoy: 23, cuotaDesconocida: false, preferente: true, automatico: true },
    { id: "xkiro", nombre: "xKiro", url: "https://api.xkiro.com/v1", estado: "conectado" as const,
      modelos: ["qwen3-coder-plus:free", "qwen3-coder-plus", "gemini-3-pro", "deepseek-v4"],
      llamadasHoy: 67, cuotaDesconocida: false, preferente: true, automatico: true },
    { id: "tokenrouter", nombre: "TokenRouter", url: "https://api.tokenrouter.com/v1", estado: "conectado" as const,
      modelos: ["glm-5.3-free", "deepseek-v4-flash-0731", "minimax-m3:free"],
      llamadasHoy: 34, cuotaDesconocida: false, preferente: false, automatico: true },
    { id: "openrouter", nombre: "OpenRouter", url: "https://openrouter.ai/api/v1", estado: "desconectado" as const,
      modelos: [], llamadasHoy: 0, cuotaDesconocida: true, preferente: false, automatico: false },
];

const DIRECTORES_ESPECIALIZADOS: DirectorEspecializado[] = [
    { id: "director-escritura", nombre: "Director de Escritura", descripcion: "Tareas de código, docs y contenido masivo",
      icono: "Code2", activo: true, modeloPreferido: "apinex/free/deepseek-v4-pro-0813",
      modeloAlternativo: "xkiro/qwen/qwen3-coder-plus:free", apisHabilitadas: ["apinex", "xkiro", "tokenrouter"],
      maxConcurrentes: 3, timeoutSegundos: 600, reintentos: 3,
      contexto: "Eres un agente de desarrollo especializado en escribir código, documentación y contenido técnico de forma económica y eficiente. Priorizas APIs gratuitas y verificadas.",
      instrucciones: "1) Usa el modelo preferido primero. 2) Si falla, reintenta con alternativo. 3) Si rate-limit, espera y reasigna. 4) Verifica resultado antes de finalizar.",
      encendidoAuto: true, solucionErrores: true, rebalanceoAutomatico: true,
      historialAcciones: [], ultimaAccion: "", estado: "detenido" },
    { id: "director-revision", nombre: "Director de Revisión", descripcion: "Revisión y verificación de código, pruebas y calidad",
      icono: "CheckCircle", activo: true, modeloPreferido: "nvidia/moonshotai/kimi-k3",
      modeloAlternativo: "xkiro/qwen/qwen3-coder-plus:free", apisHabilitadas: ["nvidia-nim", "xkiro"],
      maxConcurrentes: 2, timeoutSegundos: 300, reintentos: 2,
      contexto: "Eres un agente de revisión especializado en verificar código, ejecutar pruebas y validar calidad. Priorizas precisión sobre velocidad.",
      instrucciones: "1) Revisa el código completo antes de verificar. 2) Ejecuta tests si es posible. 3) Reporta hallazgos con claridad. 4) Si el proveedor falla, reasigna automáticamente.",
      encendidoAuto: true, solucionErrores: true, rebalanceoAutomatico: true,
      historialAcciones: [], ultimaAccion: "", estado: "detenido" },
    { id: "director-puente", nombre: "Director del Puente", descripcion: "Mantencion del Puente de Mando, sincronización y operación continua",
      icono: "Activity", activo: true, modeloPreferido: "apinex/free/gemini-3.8-flash",
      modeloAlternativo: "xkiro/qwen/qwen3-coder-plus:free", apisHabilitadas: ["apinex", "tokenrouter"],
      maxConcurrentes: 2, timeoutSegundos: 300, reintentos: 2,
      contexto: "Eres el Director del Puente de Mando. Mantienes operativa la orquestación, verificas latidos, reaccionas a errores y reportas estado. Opera de forma continua mientras hay tareas pendientes.",
      instrucciones: "1) Verifica latidos cada 20s. 2) Si un agente está quieto >300s, marca como colgado. 3) Reasigna tareas colgadas a APIs alternativas. 4) Reporta estado al canal. 5) Cuida la RAM del dispositivo.",
      encendidoAuto: true, solucionErrores: true, rebalanceoAutomatico: true,
      historialAcciones: [], ultimaAccion: "", estado: "detenido" },
    { id: "director-despliegue", nombre: "Director de Despliegue", descripcion: "Verificación, build, tests y publicación",
      icono: "Zap", activo: false, modeloPreferido: "nvidia/moonshotai/kimi-k3",
      modeloAlternativo: "apinex/free/deepseek-v4-pro-0813", apisHabilitadas: ["nvidia-nim", "apinex"],
      maxConcurrentes: 1, timeoutSegundos: 900, reintentos: 1,
      contexto: "Eres el Director de Despliegue. Verificas builds, ejecutas tests y preparas publicaciones. Usas modelos potentes solo para verificación.",
      instrucciones: "1) Ejecuta tsc antes de verificar. 2) Run tests. 3) Verify build. 4) Reporta resultado. 5) No despliega sin confirmación.",
      encendidoAuto: false, solucionErrores: true, rebalanceoAutomatico: false,
      historialAcciones: [], ultimaAccion: "", estado: "detenido" },
];

const AJUSTES_POR_DEFECTO: AjusteConfig[] = [
    { id: "encendido_global", categoria: "global", nombre: "Orquestación global", descripcion: "Arranca/detiene todos los directores y agentes simultáneamente", valor: "apagado", tipo: "toggle", activo: true },
    { id: "monitoreo_ram", categoria: "global", nombre: "Monitoreo de RAM", descripcion: "Verifica RAM libre y ajusta concurrencia automáticamente", valor: "activo", tipo: "select", opciones: ["activo", "pasivo", "desactivado"], activo: true },
    { id: "umbral_ram_mb", categoria: "global", nombre: "Umbral RAM mínimo (MB)", descripcion: "Memoria libre mínima para mantener orquestación activa", valor: "500", tipo: "number", activo: true },
    { id: "verificacion_automatica", categoria: "global", nombre: "Verificación automática", descripcion: "Ejecuta verificaciones (tsc, tests, build) cuando hay cambios pendientes", valor: "activo", tipo: "select", opciones: ["activo", "solo-tareas", "desactivado"], activo: true },
    { id: "reportes_canal", categoria: "global", nombre: "Reportes al canal", descripcion: "Envía reportes de estado al canal de Telegram cada N minutos", valor: "5", tipo: "number", activo: true },
    { id: "guardar_trabajo", categoria: "global", nombre: "Guardar trabajo pendiente", descripcion: "Auto-guarda progreso de tareas antes de reasignar o detener", valor: "activo", tipo: "toggle", activo: true },
    { id: "enrutamiento_auto", categoria: "enrutamiento", nombre: "Enrutamiento automático", descripcion: "Distribuye tareas entre APIs disponibles según capacidad y cuota", valor: "activo", tipo: "toggle", activo: true },
    { id: "estrategia_enrutamiento", categoria: "enrutamiento", nombre: "Estrategia de enrutamiento", descripcion: "Cómo distribuir tareas entre los proveedores", valor: "balanceado", tipo: "select", opciones: ["balanceado", "preferente-primero", "alternativo-reservado", "menos-uso"], activo: true },
    { id: "deteccion_cupo", categoria: "enrutamiento", nombre: "Detección de cuota", descripcion: "Verifica límites de cada API antes de asignar tareas", valor: "activo", tipo: "toggle", activo: true },
    { id: "fallback_auto", categoria: "enrutamiento", nombre: "Fallback automático", descripcion: "Si una API falla, reasigna automáticamente a alternativa", valor: "activo", tipo: "toggle", activo: true },
    { id: "rate_limit_espera", categoria: "enrutamiento", nombre: "Espera en rate-limit (s)", descripcion: "Tiempo de espera antes de reintentar tras rate-limit", valor: "30", tipo: "number", activo: true },
    { id: "reintentos_en_ruta", categoria: "enrutamiento", nombre: "Reintentos por ruta", descripcion: "Número de reintentos antes de cambiar de API", valor: "3", tipo: "number", activo: true },
    { id: "solucion_errores_global", categoria: "errores", nombre: "Solución automática de errores", descripcion: "Detecta y resuelve errores de forma inteligente (reattribution, reinicio, cleanup)", valor: "activo", tipo: "toggle", activo: true },
    { id: "errores_detectar_api", categoria: "errores", nombre: "Detectar errores de API", descripcion: "Monitorea timeouts, rate-limits, 402/429/405 y reacciona automáticamente", valor: "activo", tipo: "toggle", activo: true },
    { id: "errores_reescalar_modelo", categoria: "errores", nombre: "Reescalar modelo en error", descripcion: "Si modelo falla, intenta con uno más capaz antes de abandonar", valor: "activo", tipo: "toggle", activo: true },
    { id: "errores_reset_progreso", categoria: "errores", nombre: "Resetear progreso en fallo", descripcion: "Si tarea falla, deja progreso registrado para análisis posterior", valor: "activo", tipo: "toggle", activo: true },
    { id: "errores_reportar_chat", categoria: "errores", nombre: "Reportar errores al chat", descripcion: "Notifica errores detectados al canal de órdenes", valor: "activo", tipo: "toggle", activo: true },
    { id: "errores_deteccion_bloqueo", categoria: "errores", nombre: "Detección de bloqueo", descripcion: "Si tarea está bloqueada >5 min sin avance, reasigna automáticamente", valor: "activo", tipo: "toggle", activo: true },
    { id: "director_escritura_activo", categoria: "directores", nombre: "Director de Escritura", descripcion: "Tareas de código, docs y contenido masivo — modelo: deepseek-v4-pro-0813", valor: "activo", tipo: "toggle", activo: true },
    { id: "director_escritura_concurrentes", categoria: "directores", nombre: "Concurrentes (Escritura)", descripcion: "Número máximo de agentes en paralelo para escritura", valor: "3", tipo: "number", activo: true },
    { id: "director_escritura_timeout", categoria: "directores", nombre: "Timeout (Escritura)", descripcion: "Tiempo máximo por tarea de escritura (segundos)", valor: "600", tipo: "number", activo: true },
    { id: "director_revision_activo", categoria: "directores", nombre: "Director de Revisión", descripcion: "Revisión y verificación de código, pruebas — modelo: kimi-k3", valor: "activo", tipo: "toggle", activo: true },
    { id: "director_revision_concurrentes", categoria: "directores", nombre: "Concurrentes (Revisión)", descripcion: "Número máximo de agentes en paralelo para revisión", valor: "2", tipo: "number", activo: true },
    { id: "director_revision_timeout", categoria: "directores", nombre: "Timeout (Revisión)", descripcion: "Tiempo máximo por revisión (segundos)", valor: "300", tipo: "number", activo: true },
    { id: "director_puente_activo", categoria: "directores", nombre: "Director del Puente", descripcion: "Mantención del Puente de Mando y operación continua — modelo: gemini-3.8-flash", valor: "activo", tipo: "toggle", activo: true },
    { id: "director_puente_concurrentes", categoria: "directores", nombre: "Concurrentes (Puente)", descripcion: "Número máximo de agentes en paralelo para el puente", valor: "2", tipo: "number", activo: true },
    { id: "director_puente_timeout", categoria: "directores", nombre: "Timeout (Puente)", descripcion: "Tiempo máximo por tarea de puente (segundos)", valor: "300", tipo: "number", activo: true },
    { id: "director_despliegue_activo", categoria: "directores", nombre: "Director de Despliegue", descripcion: "Build, tests y publicación — modelo: kimi-k3", valor: "desactivado", tipo: "toggle", activo: false },
    { id: "director_despliegue_concurrentes", categoria: "directores", nombre: "Concurrentes (Despliegue)", descripcion: "Número máximo de agentes en paralelo para despliegue", valor: "1", tipo: "number", activo: true },
    { id: "director_despliegue_timeout", categoria: "directores", nombre: "Timeout (Despliegue)", descripcion: "Tiempo máximo por despliegue (segundos)", valor: "900", tipo: "number", activo: true },
    { id: "capacidad_cpu", categoria: "recursos", nombre: "Capacidad CPU detectada", descripcion: "Núcleos disponibles para procesos de fondo", valor: "detectado", tipo: "text", lectura: true, activo: true },
    { id: "capacidad_ram", categoria: "recursos", nombre: "RAM libre detectada", descripcion: "Memoria disponible para nuevos agentes", valor: "detectado", tipo: "text", lectura: true, activo: true },
    { id: "capacidad_agentes", categoria: "recursos", nombre: "Agentes caben en RAM", descripcion: "Número de agentes que caben sin agotar memoria", valor: "detectado", tipo: "text", lectura: true, activo: true },
    { id: "ajuste_automatico", categoria: "recursos", nombre: "Ajuste automático de procesos", descripcion: "Reduce concurrencia automáticamente si RAM baja", valor: "activo", tipo: "toggle", activo: true },
    { id: "swap_usado", categoria: "recursos", nombre: "Swap usado (MB)", descripcion: "Memoria swap utilizada — alto uso indica presión de RAM", valor: "detectado", tipo: "text", lectura: true, activo: true },
];

// ── Componente ─────────────────────────────────────────────────────────────

export function AjustesDirector() {
    const [categoriaActiva, setCategoriaActiva] = useState("global");
    const [estado, setEstado] = useState<EstadoDirector | null>(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [ajustes, setAjustes] = useState<AjusteConfig[]>(AJUSTES_POR_DEFECTO);
    const [directores, setDirectores] = useState<DirectorEspecializado[]>(DIRECTORES_ESPECIALIZADOS);
    const [apis, setApis] = useState<ProveedorAPI[]>(FLOTA_APIS);
    const [recursos, setRecursos] = useState({ ramMb: 0, swapMb: 0, nucleos: 0, agentesCaben: 0 });
    const [expandedDirector, setExpandedDirector] = useState<string | null>(null);
    const [accionEnCurso, setAccionEnCurso] = useState<string | null>(null);
    const [notificacion, setNotificacion] = useState<{ tipo: string; mensaje: string } | null>(null);
    const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const recargar = useCallback(async () => {
        setCargando(true);
        try {
            const [resDirector, resEstado] = await Promise.all([
                fetch("/api/mando/director", { cache: "no-store" }),
                fetch("/api/mando/estado", { cache: "no-store" }),
            ]);
            if (resDirector.ok) {
                const data = await resDirector.json() as EstadoDirector;
                setEstado(data);
                setError(null);
            }
            if (resEstado.ok) {
                const estadoFull = await resEstado.json() as any;
                const ramRaw = estadoFull.agentes?.memoriaLibreMb ?? 0;
                const swapRaw = (estadoFull.agentes as any)?.swapUsedMb ?? 0;
                const nucleos = Math.max(2, navigator.hardwareConcurrency || 4);
                setRecursos({
                    ramMb: ramRaw,
                    swapMb: swapRaw || 0,
                    nucleos,
                    agentesCaben: Math.max(1, Math.floor(ramRaw / 700)),
                });
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Error");
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        void recargar();
        intervaloRef.current = setInterval(() => void recargar(), 20_000);
        return () => { if (intervaloRef.current) clearInterval(intervaloRef.current); };
    }, [recargar]);

    const mostrarNotificacion = useCallback((tipo: string, mensaje: string) => {
        setNotificacion({ tipo, mensaje });
        setTimeout(() => setNotificacion(null), 4000);
    }, []);

    const cambiarAjuste = useCallback((id: string, nuevoValor: string) => {
        setAjustes(prev => prev.map(a => a.id === id ? { ...a, valor: nuevoValor } : a));
    }, []);

    const toggleDirector = useCallback((id: string, encendido: boolean) => {
        setDirectores(prev => prev.map(d => {
            if (d.id !== id) return d;
            return { ...d, activo: encendido, estado: encendido ? "arrancando" : "detenido", ultimaAccion: encendido ? "Encendido manual" : "Apagado manual", historialAcciones: [...d.historialAcciones, `${new Date().toISOString().slice(11,19)} — ${encendido ? "ENCENDIDO" : "APAGADO"} por usuario`] };
        }));
        const nombreDir = directores.find(d=>d.id===id)?.nombre ?? id;
        mostrarNotificacion("aviso", `Director ${nombreDir} ${encendido ? "encendido" : "apagado"}`);
    }, [directores, mostrarNotificacion]);

    const toggleGlobal = useCallback((encendido: boolean) => {
        setDirectores(prev => prev.map(d => ({
            ...d,
            activo: encendido,
            estado: encendido ? "arrancando" : "detenido",
            ultimaAccion: encendido ? "Encendido global" : "Apagado global",
            historialAcciones: [...d.historialAcciones, `${new Date().toISOString().slice(11,19)} — ${encendido ? "ENCENDIDO GLOBAL" : "APAGADO GLOBAL"}`],
        })));
        mostrarNotificacion("aviso", `Orquestación ${encendido ? "ENCENDIDA" : "APAGADA"} globalmente — ${directores.length} directores`);
    }, [directores, mostrarNotificacion]);

    const reasignarAPI = useCallback((directorId: string, apiId: string, accion: "habilitar" | "deshabilitar" | "priorizar" | "despriorizar") => {
        setDirectores(prev => prev.map(d => {
            if (d.id !== directorId) return d;
            const apisActuales = [...d.apisHabilitadas];
            if (accion === "habilitar" && !apisActuales.includes(apiId)) apisActuales.push(apiId);
            if (accion === "deshabilitar") apisActuales.splice(apisActuales.indexOf(apiId), 1);
            if (accion === "priorizar") { const idx = apisActuales.indexOf(apiId); if (idx >= 0) { apisActuales.splice(idx, 1); apisActuales.unshift(apiId); } }
            if (accion === "despriorizar") { const idx = apisActuales.indexOf(apiId); if (idx >= 0) { apisActuales.splice(idx, 1); apisActuales.push(apiId); } }
            return { ...d, apisHabilitadas: apisActuales, ultimaAccion: `${accion} ${apiId}`, historialAcciones: [...d.historialAcciones, `${new Date().toISOString().slice(11,19)} — ${accion} ${apiId}`] };
        }));
    }, []);

    const ejecutarAccionDirector = useCallback((directorId: string, accion: string) => {
        setAccionEnCurso(accion);
        setDirectores(prev => prev.map(d => {
            if (d.id !== directorId) return d;
            const ahora = new Date().toISOString().slice(11,19);
            return { ...d, ultimaAccion: accion, historialAcciones: [...d.historialAcciones, `${ahora} — ${accion}`], estado: "activo" as EstadoDirectorType };
        }));
        setTimeout(() => setAccionEnCurso(null), 2000);
        const nombreDir = directores.find(d=>d.id===directorId)?.nombre ?? directorId;
        mostrarNotificacion("aviso", `Acción "${accion}" ejecutada en ${nombreDir}`);
    }, [directores, mostrarNotificacion]);

    const categoriaActual = ajustes.filter(a => a.categoria === categoriaActiva);
    const directoresActivos = directores.filter(d => d.activo).length;

    const iconoComponente = (nombre: string): React.ComponentType<any> | undefined => {
        const map: Record<string, React.ComponentType<any>> = {
            Bot, CheckCircle, Clock, Cpu, ExternalLink, Gauge, Plug, RefreshCw,
            Settings, Shield, Wifi, XCircle, Zap, Power, AlertTriangle, Play,
            Square, RotateCcw, ArrowUpDown, BarChart3, ChevronDown, ChevronUp,
            Copy, Trash2, Plus, Minus, Activity, TrendingUp, Code2,
        };
        return map[nombre] || Bot;
    };

    const IconNavegacion = (cat: string) => {
        switch (cat) {
            case "global": return Settings;
            case "directores": return Bot;
            case "enrutamiento": return ArrowUpDown;
            case "errores": return AlertTriangle;
            case "recursos": return Cpu;
            case "apis": return Plug;
            default: return Settings;
        }
    };

    return (
        <div className="space-y-4">
            {/* Notificación */}
            {notificacion && (
                <div className={`rounded-lg border px-3 py-2 text-xs text-white/80 ${notificacion.tipo === "aviso" ? "border-emerald-400/30 bg-emerald-500/10" : "border-red-400/30 bg-red-500/10"}`}>
                    <span className="mr-2">{notificacion.tipo === "aviso" ? "✓" : "⚠"}</span>
                    {notificacion.mensaje}
                </div>
            )}

            {/* Barra de estado global */}
            <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className={`h-3 w-3 rounded-full ${directoresActivos > 0 ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
                        <span className="text-sm font-medium text-white">Estado de la Orquestación</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] text-white/50">Directores activos: <strong className="text-white/80">{directoresActivos}</strong>/{directores.length}</span>
                        <span className="text-[11px] text-white/30">|</span>
                        <span className="text-[11px] text-white/50">RAM libre: <strong className="text-white/80">{recursos.ramMb.toLocaleString()} MB</strong></span>
                        <span className="text-[11px] text-white/30">|</span>
                        <span className="text-[11px] text-white/50">Agentes caben: <strong className="text-white/80">{recursos.agentesCaben}</strong></span>
                    </div>
                </div>
            </div>

            {/* Botones de encendido/apagado globales */}
            <div className="flex flex-wrap gap-2">
                {directoresActivos > 0 ? (
                    <button onClick={() => toggleGlobal(false)}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-2 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/20">
                        <Square className="h-3 w-3" />
                        Apagar todos los directores
                    </button>
                ) : (
                    <button onClick={() => toggleGlobal(true)}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20">
                        <Play className="h-3 w-3" />
                        Encender todos los directores
                    </button>
                )}
                <button onClick={recargar}
                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-white/60 transition-colors hover:bg-white/[0.04]">
                    <RefreshCw className="h-3 w-3" />
                    Recargar estado
                </button>
            </div>

            {/* Navegación por categorías */}
            <div className="flex flex-wrap gap-2">
                {(["global", "directores", "enrutamiento", "errores", "recursos", "apis"] as const).map(cat => {
                    const Icon = IconNavegacion(cat);
                    return (
                        <button key={cat}
                            onClick={() => setCategoriaActiva(cat)}
                            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors ${categoriaActiva === cat ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/[0.02] text-white/60 hover:bg-white/[0.04]"}`}>
                            <Icon className="h-3 w-3" />
                            {cat.charAt(0).toUpperCase() + cat.slice(1)}
                        </button>
                    );
                })}
            </div>

            {/* Contenido por categoría */}
            {categoriaActiva === "global" && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-white">Configuración global de orquestación</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {categoriaActual.filter(a => !a.lectura).map(ajuste => (
                            <div key={ajuste.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-white/80">{ajuste.nombre}</span>
                                    <span className="text-[10px] text-white/40" title={ajuste.descripcion}>{ajuste.descripcion.slice(0,40)}…</span>
                                </div>
                                <p className="mt-1 text-[11px] text-white/50">{ajuste.descripcion}</p>
                                {ajuste.tipo === "toggle" ? (
                                    <button onClick={() => cambiarAjuste(ajuste.id, ajuste.valor === "activo" ? "desactivado" : "activo")}
                                        className={`mt-2 w-full cursor-pointer rounded border px-3 py-1.5 text-xs transition-colors ${ajuste.valor === "activo" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/[0.02] text-white/50"}`}>
                                        {ajuste.valor === "activo" ? "✓ ACTIVO" : "○ Desactivado"}
                                    </button>
                                ) : ajuste.tipo === "select" ? (
                                    <select value={ajuste.valor} onChange={e => cambiarAjuste(ajuste.id, e.target.value)}
                                        className="mt-2 w-full cursor-pointer rounded border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white/80 outline-none focus:border-emerald-400/50">
                                        {ajuste.opciones?.map(op => <option key={op} value={op}>{op}</option>)}
                                    </select>
                                ) : ajuste.tipo === "number" ? (
                                    <input type="number" value={ajuste.valor} onChange={e => cambiarAjuste(ajuste.id, e.target.value)}
                                        className="mt-2 w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white/80 outline-none focus:border-emerald-400/50" />
                                ) : (
                                    <input type="text" value={ajuste.valor} onChange={e => cambiarAjuste(ajuste.id, e.target.value)}
                                        className="mt-2 w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white/80 outline-none focus:border-emerald-400/50" />
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Estado de recursos */}
                    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                        <h4 className="text-xs font-semibold text-white/80 mb-2">Estado de recursos del dispositivo</h4>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div className="rounded bg-white/[0.03] p-2">
                                <span className="text-white/50">RAM libre:</span>
                                <span className="ml-1 font-mono text-emerald-300">{recursos.ramMb.toLocaleString()} MB</span>
                                <div className="mt-1 h-1.5 rounded bg-white/10 overflow-hidden">
                                    <div className={`h-full rounded ${recursos.ramMb > 1000 ? "bg-emerald-400" : recursos.ramMb > 500 ? "bg-amber-400" : "bg-red-400"}`}
                                        style={{ width: `${Math.min(100, (recursos.ramMb / 8000) * 100)}%` }} />
                                </div>
                            </div>
                            <div className="rounded bg-white/[0.03] p-2">
                                <span className="text-white/50">Swap usado:</span>
                                <span className="ml-1 font-mono text-white/70">{recursos.swapMb.toLocaleString()} MB</span>
                            </div>
                            <div className="rounded bg-white/[0.03] p-2">
                                <span className="text-white/50">Núcleos detectados:</span>
                                <span className="ml-1 font-mono text-white/70">{recursos.nucleos}</span>
                            </div>
                            <div className="rounded bg-white/[0.03] p-2">
                                <span className="text-white/50">Agentes que caben:</span>
                                <span className="ml-1 font-mono text-emerald-300">{recursos.agentesCaben}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {categoriaActiva === "directores" && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-white">Agentes Directores Especializados</h3>
                        <span className="text-[10px] text-white/40">{directoresActivos} activos de {directores.length}</span>
                    </div>
                    <p className="text-[11px] text-white/50">Cada director es un agente especializado con sus propios modelos, APIs, contexto e instrucciones. Encéndelos/apágalos individualmente o todos a la vez.</p>

                    {/* Botón global de encendido/apagado */}
                    <div className="flex gap-2 mb-3">
                        {directoresActivos === directores.length ? (
                            <button onClick={() => toggleGlobal(false)}
                                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300">
                                <Square className="h-3 w-3" /> Apagar todos
                            </button>
                        ) : (
                            <button onClick={() => toggleGlobal(true)}
                                className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300">
                                <Play className="h-3 w-3" /> Encender todos
                            </button>
                        )}
                    </div>

                    {/* Lista de directores */}
                    <div className="space-y-2">
                        {directores.map(director => {
                            const Icon = iconoComponente(director.icono) as React.ComponentType<any> || Bot;
                            const expandido = expandedDirector === director.id;

                            return (
                                <div key={director.id}
                                    className={`rounded-lg border transition-all ${director.activo ? "border-emerald-400/20 bg-emerald-500/5" : "border-white/5 bg-white/[0.02]"} p-3`}>
                                    {/* Cabecera del director */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={`h-2 w-2 rounded-full ${director.activo ? "bg-emerald-400" : "bg-white/20"}`} />
                                            <Icon className="h-4 w-4 text-white/60" />
                                            <div>
                                                <span className="text-xs font-medium text-white/90">{director.nombre}</span>
                                                <p className="text-[10px] text-white/40">{director.descripcion}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${director.activo ? "border-emerald-400/30 text-emerald-300" : "border-white/10 text-white/40"}`}>
                                                {director.estado}
                                            </span>
                                            <button onClick={() => setExpandedDirector(expandido ? null : director.id)}
                                                className="cursor-pointer p-1 rounded hover:bg-white/10 text-white/40">
                                                {expandido ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Controles de encendido/apagado individual */}
                                    <div className="flex items-center gap-2 mt-2">
                                        {director.activo ? (
                                            <button onClick={() => toggleDirector(director.id, false)}
                                                className="inline-flex cursor-pointer items-center gap-1 rounded border border-red-400/30 bg-red-500/10 px-2 py-1 text-[10px] text-red-300">
                                                <Square className="h-2.5 w-2.5" /> Detener
                                            </button>
                                        ) : (
                                            <button onClick={() => toggleDirector(director.id, true)}
                                                className="inline-flex cursor-pointer items-center gap-1 rounded border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300">
                                                <Play className="h-2.5 w-2.5" /> Iniciar
                                            </button>
                                        )}
                                        <span className="text-[10px] text-white/40">Modelo: <span className="text-white/60">{director.modeloPreferido.split("/").slice(-1)[0]}</span></span>
                                    </div>

                                    {/* Panel expandido */}
                                    {expandido && (
                                        <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
                                            {/* Modelos */}
                                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                                                <div className="rounded bg-white/[0.03] p-2">
                                                    <span className="text-white/50">Modelo principal:</span>
                                                    <span className="block font-mono text-emerald-300 text-[10px]">{director.modeloPreferido}</span>
                                                </div>
                                                <div className="rounded bg-white/[0.03] p-2">
                                                    <span className="text-white/50">Alternativo:</span>
                                                    <span className="block font-mono text-white/60 text-[10px]">{director.modeloAlternativo}</span>
                                                </div>
                                            </div>

                                            {/* APIs habilitadas */}
                                            <div className="flex flex-wrap gap-1">
                                                {director.apisHabilitadas.map(apiId => {
                                                    const api = apis.find(a => a.id === apiId);
                                                    return (
                                                        <span key={apiId}
                                                            className="inline-flex cursor-pointer items-center gap-1 rounded border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/60 hover:bg-white/[0.06]">
                                                            <Wifi className="h-2.5 w-2.5 text-emerald-400" />
                                                            {api?.nombre}
                                                            {api?.estado === "conectado" ? " ✓" : " ⚠"}
                                                        </span>
                                                    );
                                                })}
                                            </div>

                                            {/* Ajustes numéricos */}
                                            <div className="grid grid-cols-3 gap-2 text-[11px]">
                                                <div className="rounded bg-white/[0.03] p-2">
                                                    <span className="text-white/50">Concurrentes:</span>
                                                    <input type="number" value={director.maxConcurrentes} min={1} max={10}
                                                        onChange={e => setDirectores(prev => prev.map(d => d.id === director.id ? { ...d, maxConcurrentes: parseInt(e.target.value) || 1 } : d))}
                                                        className="mt-1 w-full rounded border border-white/10 bg-black/40 px-1 py-0.5 text-[10px] text-white/80 text-center outline-none" />
                                                </div>
                                                <div className="rounded bg-white/[0.03] p-2">
                                                    <span className="text-white/50">Timeout:</span>
                                                    <input type="number" value={director.timeoutSegundos} min={60} max={3600}
                                                        onChange={e => setDirectores(prev => prev.map(d => d.id === director.id ? { ...d, timeoutSegundos: parseInt(e.target.value) || 300 } : d))}
                                                        className="mt-1 w-full rounded border border-white/10 bg-black/40 px-1 py-0.5 text-[10px] text-white/80 text-center outline-none" />
                                                    <span className="text-[9px] text-white/30">seg</span>
                                                </div>
                                                <div className="rounded bg-white/[0.03] p-2">
                                                    <span className="text-white/50">Reintentos:</span>
                                                    <input type="number" value={director.reintentos} min={0} max={10}
                                                        onChange={e => setDirectores(prev => prev.map(d => d.id === director.id ? { ...d, reintentos: parseInt(e.target.value) || 0 } : d))}
                                                        className="mt-1 w-full rounded border border-white/10 bg-black/40 px-1 py-0.5 text-[10px] text-white/80 text-center outline-none" />
                                                </div>
                                            </div>

                                            {/* Toggle inteligentes */}
                                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                                                <label className="flex items-center gap-2 rounded bg-white/[0.03] p-2 cursor-pointer">
                                                    <input type="checkbox" checked={director.encendidoAuto} onChange={e => setDirectores(prev => prev.map(d => d.id === director.id ? { ...d, encendidoAuto: e.target.checked } : d))}
                                                        className="rounded border-white/20 bg-white/5 text-emerald-400 focus:ring-emerald-400/30" />
                                                    <span className="text-white/60">Arranque automático</span>
                                                </label>
                                                <label className="flex items-center gap-2 rounded bg-white/[0.03] p-2 cursor-pointer">
                                                    <input type="checkbox" checked={director.solucionErrores} onChange={e => setDirectores(prev => prev.map(d => d.id === director.id ? { ...d, solucionErrores: e.target.checked } : d))}
                                                        className="rounded border-white/20 bg-white/5 text-emerald-400 focus:ring-emerald-400/30" />
                                                    <span className="text-white/60">Solución de errores</span>
                                                </label>
                                                <label className="flex items-center gap-2 rounded bg-white/[0.03] p-2 cursor-pointer">
                                                    <input type="checkbox" checked={director.rebalanceoAutomatico} onChange={e => setDirectores(prev => prev.map(d => d.id === director.id ? { ...d, rebalanceoAutomatico: e.target.checked } : d))}
                                                        className="rounded border-white/20 bg-white/5 text-emerald-400 focus:ring-emerald-400/30" />
                                                    <span className="text-white/60">Rebalanceo automático</span>
                                                </label>
                                            </div>

                                            {/* Contexto e instrucciones */}
                                            <div className="space-y-2">
                                                <div>
                                                    <span className="text-[10px] text-white/50">Contexto del director:</span>
                                                    <textarea value={director.contexto} onChange={e => setDirectores(prev => prev.map(d => d.id === director.id ? { ...d, contexto: e.target.value } : d))}
                                                        className="mt-1 w-full min-h-[60px] rounded border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-white/70 outline-none focus:border-emerald-400/50 resize-none" />
                                                </div>
                                                <div>
                                                    <span className="text-[10px] text-white/50">Instrucciones de operación:</span>
                                                    <textarea value={director.instrucciones} onChange={e => setDirectores(prev => prev.map(d => d.id === director.id ? { ...d, instrucciones: e.target.value } : d))}
                                                        className="mt-1 w-full min-h-[60px] rounded border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-white/70 outline-none focus:border-emerald-400/50 resize-none" />
                                                </div>
                                            </div>

                                            {/* Historial de acciones */}
                                            <div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] text-white/50">Historial reciente:</span>
                                                    <button onClick={() => ejecutarAccionDirector(director.id, "Reiniciar director")}
                                                        className="cursor-pointer text-[10px] text-emerald-400 hover:text-emerald-300">
                                                        Reiniciar director
                                                    </button>
                                                </div>
                                                <div className="mt-1 max-h-[80px] overflow-y-auto rounded bg-black/20 p-1 text-[10px] text-white/40 font-mono">
                                                    {director.historialAcciones.slice(-5).map((acc, i) => (
                                                        <div key={i} className="py-0.5 border-b border-white/5 last:border-0">{acc}</div>
                                                    ))}
                                                    {director.historialAcciones.length === 0 && <div className="py-1 text-white/30">Sin acciones registradas</div>}
                                                </div>
                                                <div className="mt-1 text-[10px] text-white/40">
                                                    <span className="text-emerald-400">Última acción:</span> {director.ultimaAccion || "—"}
                                                </div>
                                            </div>

                                            {/* Acciones rápidas */}
                                            <div className="flex flex-wrap gap-1 pt-1">
                                                <button onClick={() => ejecutarAccionDirector(director.id, "Reasignar tareas colgadas")}
                                                    className="cursor-pointer rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-white/60 hover:bg-white/[0.06]">
                                                    🔄 Reasignar colgadas
                                                </button>
                                                <button onClick={() => ejecutarAccionDirector(director.id, "Verificar APIs")}
                                                    className="cursor-pointer rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-white/60 hover:bg-white/[0.06]">
                                                    🔍 Verificar APIs
                                                </button>
                                                <button onClick={() => ejecutarAccionDirector(director.id, "Limpiar errores pendientes")}
                                                    className="cursor-pointer rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-white/60 hover:bg-white/[0.06]">
                                                    🧹 Limpiar errores
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {categoriaActiva === "enrutamiento" && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-white">Enrutamiento automático de APIs</h3>
                    <p className="text-[11px] text-white/50">Distribuye tareas entre proveedores según capacidad, cuota y estado. El enrutamiento automático detecta APIs disponibles y reasigna tareas colgadas.</p>

                    <div className="grid gap-3 sm:grid-cols-2">
                        {categoriaActual.filter(a => !a.lectura).map(ajuste => (
                            <div key={ajuste.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-white/80">{ajuste.nombre}</span>
                                    <span className="text-[10px] text-white/40">{ajuste.descripcion.slice(0,30)}…</span>
                                </div>
                                <p className="mt-1 text-[11px] text-white/50">{ajuste.descripcion}</p>
                                {ajuste.tipo === "toggle" ? (
                                    <button onClick={() => cambiarAjuste(ajuste.id, ajuste.valor === "activo" ? "desactivado" : "activo")}
                                        className={`mt-2 w-full cursor-pointer rounded border px-3 py-1.5 text-xs transition-colors ${ajuste.valor === "activo" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/[0.02] text-white/50"}`}>
                                        {ajuste.valor === "activo" ? "✓ ACTIVO" : "○ Desactivado"}
                                    </button>
                                ) : ajuste.tipo === "select" ? (
                                    <select value={ajuste.valor} onChange={e => cambiarAjuste(ajuste.id, e.target.value)}
                                        className="mt-2 w-full cursor-pointer rounded border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white/80 outline-none focus:border-emerald-400/50">
                                        {ajuste.opciones?.map(op => <option key={op} value={op}>{op}</option>)}
                                    </select>
                                ) : (
                                    <input type="number" value={ajuste.valor} onChange={e => cambiarAjuste(ajuste.id, e.target.value)}
                                        className="mt-2 w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white/80 outline-none focus:border-emerald-400/50" />
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Estado de cada API */}
                    <div className="mt-3">
                        <h4 className="text-xs font-semibold text-white/80 mb-2">Estado de las APIs registradas</h4>
                        <div className="space-y-1">
                            {apis.map(api => (
                                <div key={api.id} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                                    <div className="flex items-center gap-3">
                                        <div className={`h-2 w-2 rounded-full ${api.estado === "conectado" ? "bg-emerald-400" : api.estado === "desconectado" ? "bg-red-400" : api.estado === "rate-limit" ? "bg-amber-400" : "bg-red-400"}`} />
                                        <div>
                                            <span className="text-xs font-medium text-white/90">{api.nombre}</span>
                                            <span className="ml-2 text-[10px] text-white/40">{api.url}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${api.estado === "conectado" ? "border-emerald-400/30 text-emerald-300" : "border-red-400/30 text-red-300"}`}>
                                            {api.estado === "conectado" ? "Conectado" : api.estado}
                                        </span>
                                        <span className="text-[10px] text-white/40">{api.llamadasHoy} llamadas hoy</span>
                                        {api.cuotaDesconocida && <span className="text-[10px] text-amber-400">cuota desconocida</span>}
                                        {api.preferente && <span className="text-[10px] text-emerald-400">preferido</span>}
                                        <div className="flex gap-1 ml-2">
                                            <button onClick={() => reasignarAPI("director-escritura", api.id, "priorizar")}
                                                className="cursor-pointer text-[10px] text-emerald-400 hover:text-emerald-300">Priorizar</button>
                                            <button onClick={() => reasignarAPI("director-escritura", api.id, "deshabilitar")}
                                                className="cursor-pointer text-[10px] text-red-400 hover:text-red-300">Excluir</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {categoriaActiva === "errores" && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-white">Solución inteligente de errores</h3>
                    <p className="text-[11px] text-white/50">Detecta y resuelve automáticamente errores de APIs, modelos y tareas. Reasigna, reescala y reporta sin intervención manual.</p>

                    <div className="grid gap-3 sm:grid-cols-2">
                        {categoriaActual.filter(a => !a.lectura).map(ajuste => (
                            <div key={ajuste.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-white/80">{ajuste.nombre}</span>
                                    <span className="text-[10px] text-white/40">{ajuste.descripcion.slice(0,30)}…</span>
                                </div>
                                <p className="mt-1 text-[11px] text-white/50">{ajuste.descripcion}</p>
                                {ajuste.tipo === "toggle" ? (
                                    <button onClick={() => cambiarAjuste(ajuste.id, ajuste.valor === "activo" ? "desactivado" : "activo")}
                                        className={`mt-2 w-full cursor-pointer rounded border px-3 py-1.5 text-xs transition-colors ${ajuste.valor === "activo" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/[0.02] text-white/50"}`}>
                                        {ajuste.valor === "activo" ? "✓ ACTIVO" : "○ Desactivado"}
                                    </button>
                                ) : (
                                    <input type="number" value={ajuste.valor} onChange={e => cambiarAjuste(ajuste.id, e.target.value)}
                                        className="mt-2 w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white/80 outline-none focus:border-emerald-400/50" />
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Tipos de errores detectados */}
                    <div className="mt-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                        <h4 className="text-xs font-semibold text-white/80 mb-2">Estrategias de solución automática</h4>
                        <div className="space-y-2 text-[11px]">
                            {[
                                { tipo: "Rate-limit (429)", accion: "Espera N segundos y reasigna a API alternativa", badge: "built-in" },
                                { tipo: "Timeout de API", accion: "Reintentar con modelo alternativo o reasignar a otro proveedor", badge: "auto" },
                                { tipo: "Error 402 (credits)", accion: "Deja de usar ese proveedor y reasigna a gratuito", badge: "auto" },
                                { tipo: "Tarea sin avance >5min", accion: "Marca como colgada, reasigna a otro agente/API", badge: "auto" },
                                { tipo: "Modelo fallido", accion: "Reintenta con modelo alternativo del mismo proveedor", badge: "auto" },
                                { tipo: "RAM insuficiente", accion: "Reduce concurrencia automáticamente hasta recuperar RAM", badge: "auto" },
                                { tipo: "Error de conexión", accion: "Reinicia conexión, si falla cambia de proveedor", badge: "auto" },
                            ].map((err, i) => (
                                <div key={i} className="flex items-center justify-between rounded bg-white/[0.03] p-2">
                                    <div>
                                        <span className="text-emerald-400 font-medium">{err.tipo}</span>
                                        <span className="text-white/50 ml-2">→ {err.accion}</span>
                                    </div>
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${err.badge === "auto" ? "border-emerald-400/30 text-emerald-300" : "border-white/10 text-white/40"}`}>
                                        {err.badge === "auto" ? "automatizado" : "integrado"}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {categoriaActiva === "recursos" && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-white">Capacidad del dispositivo y ajuste automático</h3>
                    <p className="text-[11px] text-white/50">Monitorea RAM, CPU, swap y disco para ajustar la concurrencia de agentes automáticamente sin agotar recursos.</p>

                    <div className="grid gap-3 sm:grid-cols-2">
                        {categoriaActual.filter(a => !a.lectura).map(ajuste => (
                            <div key={ajuste.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-medium text-white/80">{ajuste.nombre}</span>
                                    <span className="text-[10px] text-white/40">{ajuste.descripcion.slice(0,30)}…</span>
                                </div>
                                <p className="mt-1 text-[11px] text-white/50">{ajuste.descripcion}</p>
                                {ajuste.tipo === "toggle" ? (
                                    <button onClick={() => cambiarAjuste(ajuste.id, ajuste.valor === "activo" ? "desactivado" : "activo")}
                                        className={`mt-2 w-full cursor-pointer rounded border px-3 py-1.5 text-xs transition-colors ${ajuste.valor === "activo" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/[0.02] text-white/50"}`}>
                                        {ajuste.valor === "activo" ? "✓ ACTIVO" : "○ Desactivado"}
                                    </button>
                                ) : (
                                    <input type="number" value={ajuste.valor} onChange={e => cambiarAjuste(ajuste.id, e.target.value)}
                                        className="mt-2 w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white/80 outline-none focus:border-emerald-400/50" />
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Métricas de recursos */}
                    <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-3">
                        <h4 className="text-xs font-semibold text-emerald-300 mb-2">Métricas en vivo del dispositivo</h4>
                        <div className="grid grid-cols-2 gap-3 text-[11px]">
                            <div className="rounded bg-white/[0.03] p-2">
                                <span className="text-white/50">RAM libre:</span>
                                <div className="mt-1 flex items-center gap-2">
                                    <span className="font-mono text-emerald-300">{recursos.ramMb.toLocaleString()} MB</span>
                                    <div className="flex-1 h-2 rounded bg-white/10 overflow-hidden">
                                        <div className={`h-full rounded ${recursos.ramMb > 1000 ? "bg-emerald-400" : recursos.ramMb > 500 ? "bg-amber-400" : "bg-red-400"}`}
                                            style={{ width: `${Math.min(100, (recursos.ramMb / 8000) * 100)}%` }} />
                                    </div>
                                </div>
                                <div className="mt-1 text-[10px] text-white/40">
                                    {recursos.ramMb > 1000 ? "✅ Suficiente para orquestación" : recursos.ramMb > 500 ? "⚠ Umbral bajo — reducir procesos" : "🔴 Crítico — detener agentes"}
                                </div>
                            </div>
                            <div className="rounded bg-white/[0.03] p-2">
                                <span className="text-white/50">Agentes concurrentes máximos:</span>
                                <span className="ml-1 font-mono text-emerald-300">{recursos.agentesCaben}</span>
                                <span className="text-[10px] text-white/40">(800 MB por agente)</span>
                            </div>
                            <div className="rounded bg-white/[0.03] p-2">
                                <span className="text-white/50">Núcleos CPU:</span>
                                <span className="ml-1 font-mono text-white/70">{recursos.nucleos}</span>
                                <span className="text-[10px] text-white/40">(detectado automáticamente)</span>
                            </div>
                            <div className="rounded bg-white/[0.03] p-2">
                                <span className="text-white/50">Swap usado:</span>
                                <span className="ml-1 font-mono text-white/70">{recursos.swapMb.toLocaleString()} MB</span>
                                <span className="text-[10px] text-white/40">{recursos.swapMb > 2000 ? "🔴 Alto uso":"✅ Normal"}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {categoriaActiva === "apis" && (
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-white">Conexiones y estado de APIs</h3>
                    <p className="text-[11px] text-white/50">Cada API del catálogo es verificada antes de usarse. Las APIs desconectadas no se incorporan automáticamente.</p>

                    <div className="space-y-2">
                        {apis.map(api => (
                            <div key={api.id} className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`h-2 w-2 rounded-full ${api.estado === "conectado" ? "bg-emerald-400" : "bg-red-400"}`} />
                                        <div>
                                            <span className="text-xs font-medium text-white/90">{api.nombre}</span>
                                            <span className="ml-2 text-[10px] text-white/40">{api.url}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${api.estado === "conectado" ? "border-emerald-400/30 text-emerald-300" : "border-red-400/30 text-red-300"}`}>
                                            {api.estado === "conectado" ? `Conectado (${api.modelos.length} modelos)` : "Desconectado"}
                                        </span>
                                        {api.preferente && <span className="text-[10px] text-emerald-400">★ preferido</span>}
                                        {api.cuotaDesconocida && <span className="text-[10px] text-amber-400">⚠ cuota desconocida</span>}
                                    </div>
                                </div>
                                {api.modelos.length > 0 && (
                                    <div className="mt-1 flex flex-wrap gap-1">
                                        {api.modelos.slice(0, 5).map(m => (
                                            <span key={m} className="inline-flex rounded border border-white/5 bg-white/[0.03] px-1.5 py-0.5 text-[9px] text-white/50">{m}</span>
                                        ))}
                                        {api.modelos.length > 5 && <span className="text-[9px] text-white/30">+{api.modelos.length - 5} más</span>}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Reglas de enrutamiento */}
                    <div className="mt-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
                        <h4 className="text-xs font-semibold text-white/80 mb-2">Reglas de enrutamiento automático</h4>
                        <div className="space-y-2 text-[11px]">
                            {[
                                "1️⃣ Priorizar APIs gratuitas verificadas con generación comprobada",
                                "2️⃣ No reincorporar API solo porque GET /models responda 200",
                                "3️⃣ Distribuir carga de forma balanceada entre proveedores habilitados",
                                "4️⃣ Si una API lanza rate-limit, esperar y reasignar automáticamente",
                                "5️⃣ Verificar cuota antes de asignar tarea de larga duración",
                                "6️⃣ Mantener un registro de llamadas diarias para evitar agotar cuotas",
                                "7️⃣ En caso de error recurrente, excluir el proveedor hasta nueva verificación",
                            ].map((regla, i) => (
                                <div key={i} className="flex items-start gap-2">
                                    <span className="text-emerald-400 mt-0.5">✓</span>
                                    <span className="text-white/60">{regla}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Indicador de carga */}
            {cargando && (
                <div className="py-4 text-center text-xs text-white/30">
                    <Activity className="h-4 w-4 mx-auto text-emerald-400 animate-pulse" />
                    <span className="mt-1">Actualizando estado…</span>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    ⚠️ Error: {error}
                </div>
            )}
        </div>
    );
}
