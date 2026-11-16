"use client";

import { useId } from "react";
import type { FuentePedida } from "@/lib/control-remoto/fuente-pantalla";
import { rotuloFuente } from "@/lib/control-remoto/fuente-pantalla";

export function SelectorFuente({
    pedida,
    real,
    aviso,
    onCambiar,
}: {
    pedida: FuentePedida;
    real: "accesibilidad" | "proyeccion" | null;
    aviso: string | null;
    onCambiar: (f: FuentePedida) => void;
}) {
    const grupoId = useId();
    const autoId = `${grupoId}-auto`;
    const fluidaId = `${grupoId}-fluida`;
    const ayudaId = `${grupoId}-ayuda`;

    const opciones: { valor: FuentePedida; id: string; label: string; descripcion?: string }[] = [
        { valor: "auto", id: autoId, label: "Automática" },
        { valor: "proyeccion", id: fluidaId, label: "Fluida (proyección)", descripcion: "Pide al aparato la pantalla por proyección: más fluida; hace falta que él la ofrezca" },
    ];

    const handleChange = (valor: FuentePedida) => {
        if (valor !== pedida) onCambiar(valor);
    };

    const handleKeyDown = (e: React.KeyboardEvent, valor: FuentePedida) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            const idx = opciones.findIndex((o) => o.valor === pedida);
            const siguiente = opciones[(idx + (e.key === "ArrowRight" ? 1 : -1) + opciones.length) % opciones.length];
            handleChange(siguiente.valor);
        }
    };

    return (
        <div className="space-y-3">
            <fieldset className="space-y-2">
                <legend id={grupoId} className="sr-only">Fuente de pantalla</legend>
                <div role="radiogroup" aria-labelledby={grupoId} className="space-y-2">
                    {opciones.map((o) => (
                        <label
                            key={o.valor}
                            className="flex items-center gap-3 min-h-11 min-w-11 cursor-pointer rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white transition-colors hover:bg-white/[0.08]"
                        >
                            <input
                                type="radio"
                                id={o.id}
                                name={grupoId}
                                value={o.valor}
                                checked={pedida === o.valor}
                                onChange={() => handleChange(o.valor)}
                                onKeyDown={(e) => handleKeyDown(e, o.valor)}
                                className="h-5 w-5 accent-[#DC143C] border-white/20 bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[#DC143C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0f1a]"
                                aria-describedby={o.descripcion ? ayudaId : undefined}
                            />
                            <span>{o.label}</span>
                        </label>
                    ))}
                </div>
                {opciones[1].descripcion && (
                    <p id={ayudaId} className="text-[11px] text-white/50 ml-9">
                        {opciones[1].descripcion}
                    </p>
                )}
            </fieldset>
            <div className="text-[12px] text-white/70">
                {rotuloFuente(real)}
            </div>
            {aviso && (
                <div role="status" aria-live="polite" className="text-[12px] text-amber-300">
                    {aviso}
                </div>
            )}
        </div>
    );
}