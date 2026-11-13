"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export interface AvisoBuzon {
    id: number;
    t: string;
    de: string;
    asunto: string;
    texto: string;
    estado: "pendiente" | "entregado" | "fallo" | "archivado";
    entregado_en: string | null;
    detalle: string | null;
}

export function BuzonMetaGenesis() {
    const [avisos, setAvisos] = useState<AvisoBuzon[]>([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const cargar = useCallback(async () => {
        setCargando(true);
        setError(null);
        try {
            const r = await fetch("/api/mando/buzon", { cache: "no-store" });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const d = (await r.json()) as { avisos: AvisoBuzon[] };
            setAvisos(d.avisos ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Error desconocido");
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        void cargar();
    }, [cargar]);

    const reiniciarFallos = async () => {
        try {
            const r = await fetch("/api/mando/buzon", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            toast.success("Se reiniciaron los avisos fallidos.");
            void cargar();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "No se pudieron reiniciar los fallos.");
        }
    };

    const formatearFecha = (t: string) => {
        try {
            const d = new Date(t);
            return d.toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
        } catch {
            return t;
        }
    };

    const truncarTexto = (texto: string, max = 100) => {
        if (texto.length <= max) return texto;
        return texto.slice(0, max - 3) + "...";
    };

    return (
        <section className="space-y-4" data-testid="buzon-metagenesis">
            <header className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white/70">Buzón MetaGenesis</h3>
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="ghost"
                        className="cursor-pointer gap-1 text-cyan-200 hover:text-cyan-100"
                        onClick={cargar}
                        disabled={cargando}
                        aria-label="Refrescar avisos"
                    >
                        <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} aria-hidden />
                        Refrescar
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="cursor-pointer gap-1 text-amber-200 hover:text-amber-100"
                        onClick={reiniciarFallos}
                        disabled={cargando || avisos.every((a) => a.estado !== "fallo")}
                        aria-label="Reintentar avisos fallidos"
                    >
                        <Send className="h-4 w-4" aria-hidden />
                        Reintentar fallos
                    </Button>
                </div>
            </header>

            {cargando ? (
                <p className="text-xs text-white/50">Cargando avisos…</p>
            ) : error ? (
                <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-2 text-xs text-rose-100" role="alert">
                    {error}
                </p>
            ) : avisos.length === 0 ? (
                <p className="text-xs text-white/45">No hay avisos pendientes. La síntesis diaria de Claude nube llega a las 07:54 CDMX.</p>
            ) : (
                <ul className="space-y-3" aria-label="Avisos del buzón MetaGenesis">
                    {avisos.map((aviso) => (
                        <li
                            key={aviso.id}
                            className={`rounded-xl border p-3 text-sm ${
                                aviso.estado === "entregado"
                                    ? "border-emerald-400/30 bg-emerald-500/[0.03]"
                                    : aviso.estado === "fallo"
                                        ? "border-rose-400/30 bg-rose-500/[0.03]"
                                      : "border-amber-400/30 bg-amber-500/[0.03]"
                            }`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="space-y-1">
                                    <h4 className="font-semibold text-white">{aviso.asunto || "Sin asunto"}</h4>
                                    <p className="text-xs text-white/60">
                                        <span className="font-mono text-cyan-200">{aviso.de}</span> ·{" "}
                                        <span>{formatearFecha(aviso.t)}</span>
                                    </p>
                                    <p className="text-xs text-white/50">{truncarTexto(aviso.texto)}</p>
                                    {aviso.detalle && aviso.estado === "fallo" ? (
                                        <p className="text-xs text-rose-300/80">Error: {truncarTexto(aviso.detalle, 80)}</p>
                                    ) : null}
                                </div>
                                <span
                                    className={`text-[10px] font-medium ${
                                        aviso.estado === "entregado"
                                            ? "text-emerald-200"
                                            : aviso.estado === "fallo"
                                                ? "text-rose-200"
                                              : "text-amber-200"
                                    }`}
                                >
                                    {aviso.estado}
                                </span>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

export default BuzonMetaGenesis;