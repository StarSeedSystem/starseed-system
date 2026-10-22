"use client";

/**
 * Telepatía de cada cerebro (contrato cerebros-fusion-telepatia.md §5).
 * Lista de vínculos con estado, alcance y última sincronización, y las acciones
 * «Sincronizar ahora» y «Quitar», que van de verdad a telepatia-aplicar.ts.
 * La creación de vínculos nuevos («Nuevo vínculo» y «Pausar») llega con CB1013E–G.
 */

import { useMemo, useState } from "react";
import type { Brain } from "@/lib/brains/brains";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { normalizarVinculos, type VinculoTelepatico } from "@/lib/cerebros/telepatia";
import { quitarVinculo, sincronizarAhora } from "@/lib/cerebros/telepatia-aplicar";

export interface TelepatiaDialogProps {
    open: boolean;
    onOpenChange: (abierto: boolean) => void;
    cerebro: Brain;
    cerebros: Brain[];
    /** Se avisa cuando la lista puede haber cambiado (guardado/quita sincronización). */
    onHecho?: () => void;
}

const TIPO_DESTINO: Record<VinculoTelepatico["destino"]["tipo"], string> = { cerebro: "Cerebro", grupo: "Grupo", comunidad: "Comunidad", pagina: "Página", cuenta: "Cuenta" };
const ESTADO_VINCULO: Record<VinculoTelepatico["estado"], string> = { activo: "activo", pausado: "en pausa", pendiente: "pendiente" };

function alcanceTexto(v: VinculoTelepatico): string {
    if (v.alcance.completo) return "todo el cerebro";
    return `${v.alcance.memorias.length} memorias · ${v.alcance.carpetas.length} carpetas · ${v.alcance.configuraciones.length} configuraciones`;
}

function fechaSync(iso: string | null | undefined): string {
    const t = iso ? Date.parse(iso) : NaN;
    return Number.isNaN(t) ? "sin medida" : new Date(t).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
}

export default function TelepatiaDialog({ open, onOpenChange, cerebro, onHecho }: TelepatiaDialogProps) {
    const [ocupado, setOcupado] = useState(false);
    const vinculos = useMemo(() => normalizarVinculos(cerebro.config), [cerebro.config]);

    const sincronizar = async (v: VinculoTelepatico) => {
        setOcupado(true);
        const r = await sincronizarAhora(cerebro, v);
        setOcupado(false);
        if (!r.ok) {
            toast.error(r.motivo || "No se pudo sincronizar este vínculo.");
            return;
        }
        if (r.token) toast.success(`Vínculo externo creado. Token (solo esta vez): ${r.token}`);
        else toast.success(`${r.operaciones === 1 ? "1 cambio aplicado" : `${r.operaciones} cambios aplicados`}${r.motivo ? ` · ${r.motivo}` : ""}`);
        onHecho?.();
    };

    const quitar = async (v: VinculoTelepatico) => {
        setOcupado(true);
        const nuevo = await quitarVinculo(cerebro, v.id);
        setOcupado(false);
        if (!nuevo) {
            toast.error("No se pudo quitar el vínculo.");
            return;
        }
        toast.success("Vínculo quitado: el destino deja de recibir este cerebro.");
        onHecho?.();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Telepatía · «{cerebro.name}»</DialogTitle>
                    <DialogDescription>Vincula este cerebro con otro tuyo, un grupo o una cuenta externa, sin mezclarlos: solo se comparte lo que cada vínculo dice.</DialogDescription>
                </DialogHeader>
                {vinculos.length === 0 ? (
                    <p className="text-sm text-white/60">
                        Este cerebro no tiene vínculos de Telepatía. La creación de vínculos nuevos llega con la tarea CB1013E–G.
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {vinculos.map((v) => (
                            <li key={v.id} className="rounded-lg border border-white/10 bg-black/20 p-2.5 text-xs text-white/80">
                                <span className="block break-words font-medium text-white">{TIPO_DESTINO[v.destino.tipo]} · {v.destino.id}</span>
                                <span className="block">
                                    {v.acceso === "leer" ? "solo lectura" : "lectura y escritura"} ·
                                    {v.direccion === "enviar" ? " envía" : v.direccion === "recibir" ? " recibe" : " envía y recibe"} ·
                                    {ESTADO_VINCULO[v.estado]} · {alcanceTexto(v)} ·
                                    Última sincronización: {fechaSync(v.ultimaSync)} ·
                                    {v.expiraEn ? ` caduca el ${fechaSync(v.expiraEn)}` : " sin caducidad"}
                                </span>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <Button type="button" size="sm" variant="outline" className="whitespace-normal h-auto" disabled={ocupado} onClick={() => void sincronizar(v)}>
                                        {ocupado && <Loader2 className="animate-spin" />}
                                        {v.destino.tipo === "grupo" || v.destino.tipo === "comunidad" || v.destino.tipo === "pagina" || v.destino.tipo === "cuenta" ? "Dar acceso ahora" : "Sincronizar ahora"}
                                    </Button>
                                    <Button type="button" size="sm" variant="ghost" className="whitespace-normal h-auto" disabled={ocupado} onClick={() => void quitar(v)}>
                                        Quitar
                                    </Button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </DialogContent>
        </Dialog>
    );
}
