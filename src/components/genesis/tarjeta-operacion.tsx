"use client";

/*
 * TarjetaOperacion — una operación propuesta en Genesis/PoliGenesis, contada en palabras
 * (vista previa) antes de aplicarla. Dos pasos: «Aplicar» (o «Proponer a votación») y luego
 * «Confirmar». Nada se aplica de un solo toque. (2026-10-10)
 */

import { useState } from "react";
import { AlertTriangle, Check, Loader2, Undo2, Vote, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { describirOperacion, type Ambito, type ModoAplicacion, type Operacion } from "@/lib/genesis/operaciones";

export interface PropuestaVista {
    clave: string;
    op: Operacion;
    avisos: string[];
}

export function TarjetaOperacion({
    propuesta,
    ambito,
    modo,
    ocupado,
    onAplicar,
    onDescartar,
}: {
    propuesta: PropuestaVista;
    ambito: Ambito;
    modo: ModoAplicacion;
    ocupado: boolean;
    onAplicar: () => void;
    onDescartar: () => void;
}) {
    const [confirmando, setConfirmando] = useState(false);
    const vista = describirOperacion(propuesta.op, ambito);
    const proponer = modo === "proponer";
    return (
        <li className="space-y-2 rounded-xl border border-white/10 bg-black/25 p-3" data-testid="genesis-operacion">
            <div className="flex items-start gap-2">
                <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white">{vista.titulo}</p>
                    <p className="text-[11px] text-white/50">{propuesta.op.motivo}</p>
                </div>
                <span className="shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/45">{propuesta.op.tipo}</span>
            </div>
            {vista.detalles.length > 0 ? (
                <ul className="space-y-0.5 pl-6 text-xs text-white/70">
                    {vista.detalles.map((d, i) => (
                        <li key={i} className="break-words">
                            {d}
                        </li>
                    ))}
                </ul>
            ) : null}
            {propuesta.avisos.map((a, i) => (
                <p key={i} className="flex items-start gap-1.5 pl-6 text-[11px] text-amber-200/90">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {a}
                </p>
            ))}
            <p className="flex items-center gap-1.5 pl-6 text-[11px] text-white/45">
                <Undo2 className="h-3 w-3" aria-hidden />
                {proponer ? "Se convierte en una propuesta que la entidad vota; nada cambia hasta que se apruebe." : vista.deshacer}
            </p>
            <div className="flex flex-wrap justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" className="h-8 cursor-pointer gap-1 text-white/70" disabled={ocupado} onClick={onDescartar}>
                    <X className="h-3.5 w-3.5" aria-hidden /> Descartar
                </Button>
                {modo === "sin-permiso" ? null : confirmando ? (
                    <>
                        <Button variant="outline" size="sm" className="h-8 cursor-pointer" disabled={ocupado} onClick={() => setConfirmando(false)}>
                            Volver
                        </Button>
                        <Button size="sm" className="h-8 cursor-pointer gap-1" disabled={ocupado} onClick={onAplicar} data-testid="genesis-confirmar">
                            {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
                            {proponer ? "Confirmar propuesta" : "Confirmar y aplicar"}
                        </Button>
                    </>
                ) : (
                    <Button size="sm" className="h-8 cursor-pointer gap-1" disabled={ocupado} onClick={() => setConfirmando(true)} data-testid="genesis-aplicar">
                        {proponer ? <Vote className="h-3.5 w-3.5" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
                        {proponer ? "Proponer a votación" : "Aplicar"}
                    </Button>
                )}
            </div>
        </li>
    );
}
