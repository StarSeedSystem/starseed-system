"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { leerFuentesConectores } from "@/lib/cerebros/conectores-fuentes";
import { pushPreferences } from "@/lib/settings-sync";

export interface ConectoresPanelProps {
    brainId: string | null;
    brainName?: string;
}

export default function ConectoresPanel({ brainId, brainName }: ConectoresPanelProps) {
    const [fuentes, setFuentes] = useState<Array<{
        id: string;
        nombre: string;
        tipo: "conector" | "integracion" | "mcp" | "cuenta-externa" | "canal";
        estado: "conectado" | "falta-clave" | "disponible" | "error";
        enCerebro: boolean;
        enlace: string;
    }>>([]);
    const [avisos, setAvisos] = useState<string[]>([]);
    const [cargando, setCargando] = useState<boolean>(true);

    useEffect(() => {
        if (!brainId) {
            setFuentes([]);
            setAvisos([]);
            setCargando(false);
            return;
        }
        cargarFuentes();
    }, [brainId]);

    async function cargarFuentes() {
        setCargando(true);
        try {
            const { fuentes: f, avisos: a } = await leerFuentesConectores(brainId);
            setFuentes(f);
            setAvisos(a);
        } catch (error) {
            setAvisos(prev => [...prev, `Error: ${error instanceof Error ? error.message : String(error)}`]);
        } finally {
            setCargando(false);
        }
    }

    function manejarInterruptor(id: string, activar: boolean) {
        if (!brainId) return;
        try {
            const clave = `starseed.brain.${brainId}.conectores`;
            const valorActual = JSON.parse(localStorage.getItem(clave) || "{}");
            valorActual[id] = activar;
            localStorage.setItem(clave, JSON.stringify(valorActual));
            pushPreferences().catch(() => { });
            setFuentes(prev => 
                prev.map(f => 
                    f.id === id 
                        ? { ...f, enCerebro: activar } 
                        : f
                )
            );
        } catch (error) {
            console.error("Error al guardar preferencia de conector:", error);
        }
    }

    if (cargando) {
        return (
            <div className="p-6 text-center">
                <div className="flex h-9 w-9 items-center justify-center rounded-full mb-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-violet-500 to-fuchsia-600">
                        <svg className="h-5 w-5 text-white" stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24">
                            <path dLineCap="round" dLineJoin="round" d="M12 8v4l3 3" />
                        </svg>
                    </div>
                </div>
                <p className="text-sm text-white/60">Cargando conectores...</p>
            </div>
        );
    }

    if (fuentes.length === 0 && avisos.length === 0) {
        return (
            <div className="p-6 text-center">
                <div className="flex h-9 w-9 items-center justify-center rounded-full mb-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-800">
                        <svg className="h-5 w-5 text-white/50" stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24">
                            <path dLineCap="round" dLineJoin="round" d="M9 12l2 2 4-4" />
                        </svg>
                    </div>
                </div>
                <p className="text-sm text-white/60">No se encontraron conectores</p>
            </div>
        );
    }

    // Agrupar fuentes por tipo
    const grupos = Object.entries(
        fuentes.reduce((acc, fuente) => {
            if (!acc[fuente.tipo]) acc[fuente.tipo] = [];
            acc[fuente.tipo].push(fuente);
            return acc;
        }, {} as Record<string, typeof fuentes>)
    );

    const labelsPorTipo: Record<string, string> = {
        conector: "Conectores",
        integracion: "Integraciones",
        mcp: "Servidores MCP",
        "cuenta-externa": "Cuentas externas",
        canal: "Canales de mensajería",
    };

    return (
        <div className="space-y-6 p-4">
            {/* Avisos de errores */}
            {avisos.length > 0 && (
                <div className="bg-red-900/20 border border-red-800/30 rounded-xl p-4">
                    <div className="flex items-start gap-3 mb-3">
                        <svg className="flex-shrink-0 h-5 w-5 text-red-400" stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24">
                            <path dLineCap="round" dLineJoin="round" d="M12 8v4l3 3" />
                        </svg>
                        <div>
                            <h3 className="text-sm font-semibold text-red-300">Avisos</h3>
                            <div className="mt-2 space-y-1 text-sm text-red-200">
                                {avisos.map((aviso, index) => (
                                    <p key={index} className="flex items-start gap-2">
                                        <svg className="flex-shrink-0 h-3 w-3 text-red-400/50" stroke="currentColor" fill="none" strokeWidth="1" viewBox="0 0 24 24">
                                            <path dLineCap="round" dLineJoin="round" d="M12 8v4l3 3" />
                                        </svg>
                                        {aviso}
                                    </p>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Grupos de conectores */}
            {grupos.length > 0 && (
                <>
                    {grupos.map(([tipo, fuentesDelTipo]) => (
                        <div key={tipo} className="border border-gray-800/30 rounded-xl overflow-hidden">
                            <div className="bg-gray-900/50 px-4 py-3 border-b border-gray-800/20">
                                <h3 className="text-sm font-semibold text-gray-200">
                                    {labelsPorTipo[tipo] || tipo} ({fuentesDelTipo.length})
                                </h3>
                            </div>
                            <div className="divide-y divide-gray-800/20">
                                {fuentesDelTipo.map((fuente) => (
                                    <div key={fuente.id} className="flex items-center justify-between px-4 py-3 text-sm gap-4">
                                        <div className="flex-1 flex items-center gap-3">
                                            {/* Estado */}
                                            <div className="flex items-center gap-2">
                                                <div className={`flex h-3 w-3 items-center justify-center rounded-full ${{
                                                    "bg-green-500": fuente.estado === "conectado",
                                                    "bg-yellow-500": fuente.estado === "falta-clave" || fuente.estado === "disponible",
                                                    "bg-red-500": fuente.estado === "error",
                                                }}`}>
                                                </div>
                                                <span className="text-xs font-medium text-white/60 capitalize">
                                                    {fuente.estado}
                                                </span>
                                            </div>
                                            
                                            {/* Información */}
                                            <div className="flex-1 space-y-1">
                                                <p className="font-medium text-white">{fuente.nombre}</p>
                                                <p className="text-xs text-gray-400">{fuente.tipo}</p>
                                            </div>
                                        </div>
                                        
                                        {/* Interruptor y enlace */}
                                        <div className="flex items-center gap-3">
                                            {/* Interruptor */}
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-gray-400">Usar en este cerebro:</span>
                                                <button
                                                    onClick={() => manejarInterruptor(fuente.id, !fuente.enCerebro)}
                                                    className={`
                                                        flex h-6 w-11 items-center justify-between rounded-full border border-gray-600/50 bg-gray-800/50 transition-all
                                                        ${fuente.enCerebro ? "justify-end bg-blue-500/30 border-blue-500/50" : "justify-start"}
                                                    `}
                                                    aria-checked={fuente.enCerebro}
                                                    role="switch"
                                                    aria-label={`${fuente.nombre} ${fuente.enCerebro ? "activado" : "desactivado"}`}
                                                >
                                                    <span className="flex-shrink-0 h-4 w-4 translate-x-0.5 bg-white rounded-full transition-transform" />
                                                </button>
                                            </div>
                                            
                                            {/* Enlace de configuración */}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                asChild
                                                href={fuente.enlace}
                                                className="text-xs text-blue-300 hover:text-blue-200"
                                            >
                                                Configurar
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}