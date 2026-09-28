"use client";

/**
 * Historial de versiones (últimas 20) de un documento o una presentación: guardar una ahora y
 * restaurar cualquiera. Restaurar NO borra la historia: antes se guarda la versión actual, y la
 * restauración entra como una edición más (los demás la ven al instante).
 */

import { useCallback, useEffect, useState } from "react";
import { History, Loader2, RotateCcw, Save, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { guardarVersion, leerVersion, listarVersiones, type InfoVersion, type ListaVersiones } from "@/lib/vivo/doc-colaborativo/versiones";
import { BotonPildora } from "./comun-colab";

const MOTIVOS: Record<InfoVersion["motivo"], string> = {
    auto: "Guardado automático",
    manual: "Guardada a mano",
    restaurar: "Antes de restaurar",
};

function fecha(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Fecha desconocida";
    return d.toLocaleString("es-ES", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export interface PanelVersionesProps {
    abierto: boolean;
    onCerrar: () => void;
    espacioId: string;
    puedeEditar: boolean;
    /** «documento» / «presentación» (para los textos). */
    cosa: string;
    /** Género de `cosa`: «la presentación», «de la presentación». */
    femenino?: boolean;
    autorNombre: string | null;
    contenidoActual: () => unknown;
    resumenActual: () => string;
    /** Aplica el contenido de una versión como edición nueva. Devuelve false si no era válido. */
    onRestaurar: (contenido: unknown) => boolean;
}

export function PanelVersiones({ abierto, onCerrar, espacioId, puedeEditar, cosa, femenino, autorNombre, contenidoActual, resumenActual, onRestaurar }: PanelVersionesProps) {
    const elCosa = `${femenino ? "La" : "El"} ${cosa}`;
    const delCosa = `${femenino ? "de la" : "del"} ${cosa}`;
    const confirmar = useConfirm();
    const [lista, setLista] = useState<ListaVersiones | null>(null);
    const [ocupado, setOcupado] = useState<string | null>(null);

    const cargar = useCallback(async () => {
        setLista(null);
        setLista(await listarVersiones(espacioId));
    }, [espacioId]);

    useEffect(() => {
        if (abierto) void cargar();
    }, [abierto, cargar]);

    const guardarAhora = async () => {
        setOcupado("guardar");
        const r = await guardarVersion(espacioId, { contenido: contenidoActual(), motivo: "manual", resumen: resumenActual(), autorNombre });
        setOcupado(null);
        if (!r.ok) toast.error(r.error ?? "No se pudo guardar la versión.");
        else toast.success(r.local ? "Versión guardada en este dispositivo" : "Versión guardada");
        void cargar();
    };

    const restaurar = async (v: InfoVersion) => {
        const ok = await confirmar({
            title: "¿Restaurar esta versión?",
            description: `${elCosa} volverá a como estaba el ${fecha(v.creada)}. Antes guardamos la versión actual en el historial, así que podrás volver atrás.`,
            confirmText: "Restaurar",
        });
        if (!ok) return;
        setOcupado(v.id);
        const contenido = await leerVersion(espacioId, v);
        if (!contenido) {
            setOcupado(null);
            toast.error("No se pudo leer esa versión. Revisa la conexión.");
            return;
        }
        await guardarVersion(espacioId, { contenido: contenidoActual(), motivo: "restaurar", resumen: resumenActual(), autorNombre });
        const aplicado = onRestaurar(contenido);
        setOcupado(null);
        if (!aplicado) {
            toast.error("Esa versión no se pudo aplicar (formato desconocido).");
            return;
        }
        toast.success("Versión restaurada", { description: "Los demás ya la están viendo." });
        onCerrar();
    };

    return (
        <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
            <DialogContent className="max-h-[86dvh] max-w-lg rounded-[24px] border-white/[0.08] bg-[rgba(12,14,34,.95)] text-white">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <History className="h-5 w-5 text-[#c4b5fd]" aria-hidden="true" /> Historial de versiones
                    </DialogTitle>
                    <DialogDescription className="text-white/60">
                        Las últimas 20 fotos {delCosa}. Se guarda una sola cada 5 minutos de trabajo y antes de cada restauración.
                    </DialogDescription>
                </DialogHeader>

                {lista?.soloLocal && (
                    <p className="flex items-start gap-2 rounded-[14px] bg-[#FFBF00]/10 px-3 py-2.5 text-[12.5px] text-[#fde68a] shadow-[inset_0_0_0_1px_#FFBF0055]">
                        <Smartphone className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
                        De momento el historial se guarda solo en este dispositivo: el servidor aún no tiene el archivo de versiones compartido.
                    </p>
                )}
                {lista?.error && <p className="rounded-[14px] bg-[#DC143C]/15 px-3 py-2.5 text-[13px] text-[#fecdd3]">{lista.error}</p>}

                {puedeEditar && (
                    <BotonPildora onClick={() => void guardarAhora()} disabled={ocupado !== null} className="w-full justify-center">
                        {ocupado === "guardar" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
                        Guardar una versión ahora
                    </BotonPildora>
                )}

                <div className="min-h-[120px]">
                    {!lista ? (
                        <p className="flex items-center justify-center gap-2 py-8 text-[13px] text-white/60" role="status">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando el historial…
                        </p>
                    ) : lista.versiones.length === 0 ? (
                        <p className="py-8 text-center text-[13.5px] text-white/60">Aún no hay versiones guardadas.</p>
                    ) : (
                        <ul className="space-y-1.5" role="list">
                            {lista.versiones.map((v) => (
                                <li key={v.id} className="flex flex-wrap items-center gap-3 rounded-[16px] bg-white/[0.035] px-3.5 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,.07)]">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[14px] font-semibold capitalize">{fecha(v.creada)}</p>
                                        <p className="text-[12px] text-white/60">
                                            {MOTIVOS[v.motivo]}
                                            {v.autorNombre ? ` · ${v.autorNombre}` : ""}
                                            {v.local ? " · en este dispositivo" : ""}
                                        </p>
                                        {v.resumen && <p className="mt-0.5 line-clamp-2 text-[12.5px] text-white/75">{v.resumen}</p>}
                                    </div>
                                    {puedeEditar && (
                                        <BotonPildora onClick={() => void restaurar(v)} disabled={ocupado !== null} color="#10B981" etiqueta={`Restaurar la versión del ${fecha(v.creada)}`}>
                                            {ocupado === v.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
                                            Restaurar
                                        </BotonPildora>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
