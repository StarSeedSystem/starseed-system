"use client";

import { rotuloFuente } from "@/lib/control-remoto/fuente-pantalla";
import type { FuentePedida } from "@/lib/control-remoto/fuente-pantalla";

export interface SelectorFuenteProps {
    pedida: FuentePedida;
    real: "accesibilidad" | "proyeccion" | null;
    aviso: string | null;
    onCambiar: (f: FuentePedida) => void;
}

export function SelectorFuente({ pedida, real, aviso, onCambiar }: SelectorFuenteProps) {
    return (
        <fieldset className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <legend className="mb-2 text-sm font-medium text-white">Fuente de pantalla</legend>
            <div role="radiogroup" aria-label="Elegir fuente de pantalla" className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="radio"
                        name="fuente-pantalla"
                        value="auto"
                        checked={pedida === "auto"}
                        onChange={() => onCambiar("auto")}
                        className="h-11 w-11 accent-[#DC143C] cursor-pointer"
                        aria-label="Automática"
                    />
                    <span className="text-sm text-white">Automática</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="radio"
                        name="fuente-pantalla"
                        id="fuente-proyeccion"
                        value="proyeccion"
                        checked={pedida === "proyeccion"}
                        onChange={() => onCambiar("proyeccion")}
                        className="h-11 w-11 accent-[#DC143C] cursor-pointer"
                        aria-label="Fluida (proyección)"
                        aria-describedby="ayuda-fluida"
                    />
                    <span className="text-sm text-white">Fluida (proyección)</span>
                </label>
                <p id="ayuda-fluida" className="ml-7 text-[11px] text-white/60">
                    Pide al aparato la pantalla por proyección: más fluida; hace falta que él la ofrezca.
                </p>
            </div>
            <div className="mt-3 pt-3 border-t border-white/10">
                <p className="text-sm text-white/80" role="status" aria-live="polite">
                    {rotuloFuente(real)}
                </p>
                {aviso && (
                    <p className="mt-1 text-sm text-amber-300" role="status" aria-live="polite">
                        {aviso}
                    </p>
                )}
            </div>
        </fieldset>
    );
}