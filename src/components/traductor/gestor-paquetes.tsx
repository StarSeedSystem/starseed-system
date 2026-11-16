"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Trash2, X, AlertCircle, CheckCircle, Info, Loader2 } from "lucide-react";
import { IDIOMAS, porCodigo } from "@/lib/idiomas/idiomas";
import type { PaqueteModelo } from "@/lib/traductor/tipos";

export type EstadoDescarga = "pendiente" | "descargando" | "descargado" | "error";

export interface ProgresoDescarga {
    bytesDescargados: number;
    bytesTotales: number;
    cancelado: boolean;
}

export interface PaqueteUI {
    id: string;
    par: { origen: string; destino: string };
    bytes: number;
    hash: string;
    version: string;
    verificado: boolean;
    motor: string;
    repo: string;
    estado: EstadoDescarga;
    progreso?: ProgresoDescarga;
    error?: string;
}

export interface AlmacenInfo {
    tipo: "indexeddb" | "opfs" | "localstorage" | "sessionstorage" | "memoria" | string;
    persistente: boolean;
    espacioTotal?: number;
    espacioUsado?: number;
}

export interface ConexionInfo {
    saveData?: boolean;
    effectiveType?: string;
}

export interface GestorPaquetesProps {
    paquetes: readonly PaqueteModelo[];
    almacen: AlmacenInfo;
    conexion: ConexionInfo | null;
    onDescargar: (id: string) => Promise<void>;
    onCancelar: (id: string) => void;
    onEliminar: (id: string) => Promise<void>;
}

function formatearBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const unidades = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const valor = bytes / Math.pow(1024, i);
    const redondeado = Math.round(valor * 10) / 10;
    return `${redondeado % 1 === 0 ? redondeado.toFixed(0) : redondeado.toFixed(1)} ${unidades[i]}`;
}

function calcularEspacioUsado(paquetes: readonly PaqueteUI[]): number {
    return paquetes
        .filter((p) => p.estado === "descargado")
        .reduce((acc, p) => acc + p.bytes, 0);
}

function almacenEsPersistente(tipo: string): boolean {
    return tipo === "indexeddb" || tipo === "opfs";
}

function conexionEsMedida(conexion: ConexionInfo | null): boolean {
    if (!conexion) return false;
    return conexion.saveData === true;
}

function requiereConfirmacionDescarga(paquete: PaqueteUI): boolean {
    return !paquete.verificado && paquete.estado === "pendiente";
}

function requiereConfirmacionEliminar(_paquete: PaqueteUI): boolean {
    return true;
}

function nombreIdioma(codigo: string): string {
    return porCodigo(codigo)?.nombre ?? codigo;
}

function InsigniaEstado({ estado, verificado }: { estado: EstadoDescarga; verificado: boolean }) {
    const estilos: Record<EstadoDescarga, string> = {
        pendiente: "bg-white/10 text-white/70 border-white/20",
        descargando: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
        descargado: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
        error: "bg-red-500/20 text-red-300 border-red-500/30",
    };
    const etiquetas: Record<EstadoDescarga, string> = {
        pendiente: "Pendiente",
        descargando: "Descargando",
        descargado: "Descargado",
        error: "Error",
    };

    return (
        <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${estilos[estado]}`}
            aria-label={etiquetas[estado]}
        >
            {etiquetas[estado]}
            {!verificado && estado === "pendiente" && (
                <span className="bg-amber-500/20 text-amber-300 border-amber-500/30 px-1.5 rounded text-[9px]">
                    Sin verificar
                </span>
            )}
        </span>
    );
}

function BarraProgreso({ progreso, onCancelar }: { progreso: ProgresoDescarga; onCancelar: () => void }) {
    const porcentaje = progreso.bytesTotales > 0
        ? Math.round((progreso.bytesDescargados / progreso.bytesTotales) * 100)
        : 0;

    return (
        <div className="w-full gap-2" role="progressbar" aria-valuenow={porcentaje} aria-valuemin={0} aria-valuemax={100} aria-label="Progreso de descarga">
            <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                    className="h-full bg-cyan-400 transition-all duration-300 ease-out"
                    style={{ width: `${porcentaje}%` }}
                />
            </div>
            <span className="text-[11px] text-white/60 tabular-nums w-16 text-right">
                {formatearBytes(progreso.bytesDescargados)} / {formatearBytes(progreso.bytesTotales)}
            </span>
            <button
                type="button"
                onClick={onCancelar}
                disabled={progreso.cancelado}
                aria-label="Cancelar descarga"
                className="flex min-h-[32px] min-w-[32px] cursor-pointer items-center justify-center rounded-lg bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="boton-cancelar"
            >
                <X className="h-4 w-4" aria-hidden />
            </button>
        </div>
    );
}

function FilaPaquete({
    paquete,
    onDescargar,
    onCancelar,
    onEliminar,
    conexionMedida,
}: {
    paquete: PaqueteUI;
    onDescargar: () => void;
    onCancelar: () => void;
    onEliminar: () => void;
    conexionMedida: boolean;
}) {
    const [confirmarEliminar, setConfirmarEliminar] = useState(false);
    const [confirmarDescargaNoVerificado, setConfirmarDescargaNoVerificado] = useState(false);

    const manejarDescargar = () => {
        if (requiereConfirmacionDescarga(paquete)) {
            setConfirmarDescargaNoVerificado(true);
        } else {
            onDescargar();
        }
    };

    const manejarEliminar = () => {
        if (requiereConfirmacionEliminar(paquete)) {
            setConfirmarEliminar(true);
        } else {
            onEliminar();
        }
    };

    const origen = nombreIdioma(paquete.par.origen);
    const destino = nombreIdioma(paquete.par.destino);

    return (
        <div className="flex flex-col gap-3 p-4 rounded-xl border border-white/10 bg-white/5">
            <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-white truncate">{origen}</span>
                        <span className="text-white/40">→</span>
                        <span className="font-medium text-white truncate">{destino}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-white/50">
                        <span>{formatearBytes(paquete.bytes)}</span>
                        <span>·</span>
                        <span>{paquete.motor}</span>
                        <span>·</span>
                        <span>v{paquete.version}</span>
                    </div>
                </div>
                <InsigniaEstado estado={paquete.estado} verificado={paquete.verificado} />
            </div>

            {conexionMedida && (
                <div className="flex items-center gap-2 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                    <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>Conexión medida: la descarga ({formatearBytes(paquete.bytes)}) consumirá datos.</span>
                </div>
            )}

            {paquete.estado === "descargando" && paquete.progreso && (
                <BarraProgreso progreso={paquete.progreso} onCancelar={onCancelar} />
            )}

            {paquete.estado === "error" && paquete.error && (
                <div className="flex items-center gap-2 text-[11px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>{paquete.error}</span>
                </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
                {paquete.estado === "pendiente" && (
                    <button
                        type="button"
                        onClick={manejarDescargar}
                        className="flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-lg bg-cyan-500/20 px-4 text-cyan-300 font-medium transition-colors hover:bg-cyan-500/30 focus-visible:ring-2 focus-visible:ring-cyan-400"
                        data-testid={`boton-descargar-${paquete.id}`}
                    >
                        <Download className="h-4 w-4" aria-hidden />
                        Descargar
                    </button>
                )}

                {paquete.estado === "descargado" && (
                    <button
                        type="button"
                        onClick={manejarEliminar}
                        className="flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-lg bg-red-500/20 px-4 text-red-300 font-medium transition-colors hover:bg-red-500/30 focus-visible:ring-2 focus-visible:ring-red-400"
                        data-testid={`boton-eliminar-${paquete.id}`}
                    >
                        <Trash2 className="h-4 w-4" aria-hidden />
                        Quitar
                    </button>
                )}

                {paquete.estado === "descargando" && (
                    <button
                        type="button"
                        onClick={onCancelar}
                        className="flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-lg bg-amber-500/20 px-4 text-amber-300 font-medium transition-colors hover:bg-amber-500/30 focus-visible:ring-2 focus-visible:ring-amber-400"
                        data-testid={`boton-cancelar-${paquete.id}`}
                    >
                        <X className="h-4 w-4" aria-hidden />
                        Cancelar
                    </button>
                )}

                {paquete.estado === "error" && (
                    <button
                        type="button"
                        onClick={manejarDescargar}
                        className="flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-lg bg-cyan-500/20 px-4 text-cyan-300 font-medium transition-colors hover:bg-cyan-500/30 focus-visible:ring-2 focus-visible:ring-cyan-400"
                        data-testid={`boton-reintentar-${paquete.id}`}
                    >
                        <Loader2 className="h-4 w-4" aria-hidden />
                        Reintentar
                    </button>
                )}
            </div>

            {confirmarDescargaNoVerificado && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" data-testid="modal-confirmar-descarga">
                    <div className="w-full max-w-md rounded-xl border border-white/15 bg-black/40 p-6 backdrop-blur-xl">
                        <div className="flex items-center gap-3 mb-4">
                            <AlertCircle className="h-6 w-6 text-amber-400 shrink-0" aria-hidden />
                            <h3 className="text-lg font-semibold text-white">Confirmar descarga</h3>
                        </div>
                        <p className="text-white/80 mb-6">
                            El paquete <strong>{origen} → {destino}</strong> no ha sido verificado por una persona.
                            Su calidad puede variar. ¿Deseas continuar con la descarga de {formatearBytes(paquete.bytes)}?
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setConfirmarDescargaNoVerificado(false)}
                                className="flex min-h-[40px] cursor-pointer items-center justify-center rounded-lg bg-white/10 px-4 text-white/70 font-medium transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/30"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setConfirmarDescargaNoVerificado(false);
                                    onDescargar();
                                }}
                                className="flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-lg bg-amber-500/20 px-4 text-amber-300 font-medium transition-colors hover:bg-amber-500/30 focus-visible:ring-2 focus-visible:ring-amber-400"
                            >
                                <Download className="h-4 w-4" aria-hidden />
                                Descargar anyway
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {confirmarEliminar && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" data-testid="modal-confirmar-eliminar">
                    <div className="w-full max-w-md rounded-xl border border-white/15 bg-black/40 p-6 backdrop-blur-xl">
                        <div className="flex items-center gap-3 mb-4">
                            <AlertCircle className="h-6 w-6 text-red-400 shrink-0" aria-hidden />
                            <h3 className="text-lg font-semibold text-white">Confirmar eliminación</h3>
                        </div>
                        <p className="text-white/80 mb-6">
                            ¿Estás seguro de que quieres quitar el paquete <strong>{origen} → {destino}</strong>?
                            Se liberarán {formatearBytes(paquete.bytes)} de espacio.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setConfirmarEliminar(false)}
                                className="flex min-h-[40px] cursor-pointer items-center justify-center rounded-lg bg-white/10 px-4 text-white/70 font-medium transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/30"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setConfirmarEliminar(false);
                                    onEliminar();
                                }}
                                className="flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-lg bg-red-500/20 px-4 text-red-300 font-medium transition-colors hover:bg-red-500/30 focus-visible:ring-2 focus-visible:ring-red-400"
                            >
                                <Trash2 className="h-4 w-4" aria-hidden />
                                Quitar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ResumenEspacio({
    usado,
    total,
    persistente,
}: {
    usado: number;
    total?: number;
    persistente: boolean;
}) {
    return (
        <div className="flex flex-col gap-2 p-4 rounded-xl border border-white/10 bg-white/5">
            <div className="flex items-center justify-between">
                <span className="text-sm text-white/70">Espacio usado</span>
                <span className="font-mono text-sm text-white tabular-nums">
                    {formatearBytes(usado)} {total ? `de ${formatearBytes(total)}` : ""}
                </span>
            </div>
            {total && total > 0 && (
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-cyan-400 transition-all duration-300 ease-out"
                        style={{ width: `${Math.min(100, (usado / total) * 100)}%` }}
                    />
                </div>
            )}
            {!persistente && (
                <p className="text-[11px] text-amber-300 flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Se perderá al cerrar
                </p>
            )}
        </div>
    );
}

export {
    formatearBytes,
    calcularEspacioUsado,
    almacenEsPersistente,
    conexionEsMedida,
    requiereConfirmacionDescarga,
    requiereConfirmacionEliminar,
};

export function GestorPaquetes({
    paquetes,
    almacen,
    conexion,
    onDescargar,
    onCancelar,
    onEliminar,
}: GestorPaquetesProps) {
    const [paquetesUI, setPaquetesUI] = useState<PaqueteUI[]>(
        paquetes.map((p) => ({
            id: p.id,
            par: p.par,
            bytes: p.bytes,
            hash: p.hash,
            version: p.version,
            verificado: p.verificado,
            motor: p.motor,
            repo: p.repo,
            estado: "pendiente" as EstadoDescarga,
        }))
    );

    const conexionMedida = conexionEsMedida(conexion);
    const espacioUsado = calcularEspacioUsado(paquetesUI);
    const persistente = almacenEsPersistente(almacen.tipo);

    useEffect(() => {
        const mapa = new Map(paquetesUI.map((p) => [p.id, p]));
        let cambiado = false;
        const nuevos = paquetes.map((p) => {
            const actual = mapa.get(p.id);
            if (actual && actual.estado !== "pendiente") {
                return actual;
            }
            cambiado = true;
            return {
                id: p.id,
                par: p.par,
                bytes: p.bytes,
                hash: p.hash,
                version: p.version,
                verificado: p.verificado,
                motor: p.motor,
                repo: p.repo,
                estado: "pendiente" as EstadoDescarga,
            };
        });
        if (cambiado) setPaquetesUI(nuevos);
    }, [paquetes]);

    const manejarDescargar = useCallback(async (id: string) => {
        setPaquetesUI((prev) =>
            prev.map((p) =>
                p.id === id
                    ? { ...p, estado: "descargando" as EstadoDescarga, progreso: { bytesDescargados: 0, bytesTotales: p.bytes, cancelado: false } }
                    : p
            )
        );
        try {
            await onDescargar(id);
            setPaquetesUI((prev) =>
                prev.map((p) =>
                    p.id === id ? { ...p, estado: "descargado" as EstadoDescarga, progreso: undefined } : p
                )
            );
        } catch (error) {
            setPaquetesUI((prev) =>
                prev.map((p) =>
                    p.id === id
                        ? { ...p, estado: "error" as EstadoDescarga, error: error instanceof Error ? error.message : "Error desconocido", progreso: undefined }
                        : p
                )
            );
        }
    }, [onDescargar]);

    const manejarCancelar = useCallback((id: string) => {
        onCancelar(id);
        setPaquetesUI((prev) =>
            prev.map((p) =>
                p.id === id ? { ...p, estado: "pendiente" as EstadoDescarga, progreso: undefined } : p
            )
        );
    }, [onCancelar]);

    const manejarEliminar = useCallback(async (id: string) => {
        await onEliminar(id);
        setPaquetesUI((prev) =>
            prev.map((p) =>
                p.id === id ? { ...p, estado: "pendiente" as EstadoDescarga } : p
            )
        );
    }, [onEliminar]);

    const manejarProgreso = useCallback((id: string, bytesDescargados: number, cancelado = false) => {
        setPaquetesUI((prev) =>
            prev.map((p) =>
                p.id === id && p.progreso
                    ? { ...p, progreso: { ...p.progreso, bytesDescargados, cancelado } }
                    : p
            )
        );
    }, []);

    return (
        <div className="flex flex-col gap-4" data-testid="gestor-paquetes">
            <ResumenEspacio usado={espacioUsado} total={almacen.espacioTotal} persistente={persistente} />

            <div className="flex flex-col gap-3" role="list" aria-label="Paquetes de idiomas disponibles">
                {paquetesUI.map((paquete) => (
                    <FilaPaquete
                        key={paquete.id}
                        paquete={paquete}
                        onDescargar={() => manejarDescargar(paquete.id)}
                        onCancelar={() => manejarCancelar(paquete.id)}
                        onEliminar={() => manejarEliminar(paquete.id)}
                        conexionMedida={conexionMedida && paquete.estado === "pendiente"}
                    />
                ))}

                {paquetesUI.length === 0 && (
                    <div className="text-center py-8 text-white/50">
                        No hay paquetes de idiomas disponibles.
                    </div>
                )}
            </div>
        </div>
    );
}