"use client";

import * as React from "react";
import { LayoutDashboard, MessageSquare, Zap, Mic } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { DISENOS, EleccionDiseno } from "@/lib/widgets/astraura/disenos";

interface SelectorDisenoAstrauraProps {
    valor: EleccionDiseno;
    onCambiar: (e: EleccionDiseno) => void;
    degradado: boolean;
}

const ICONOS: Record<Exclude<EleccionDiseno, "auto">, React.ElementType> = {
    minimo: LayoutDashboard,
    conversacion: MessageSquare,
    acciones: Zap,
    voz: Mic,
};

const OPCIONES: EleccionDiseno[] = ["auto", "minimo", "conversacion", "acciones", "voz"];

export function SelectorDisenoAstraura({ valor, onCambiar, degradado }: SelectorDisenoAstrauraProps) {
    const [abierto, setAbierto] = React.useState(false);
    const botonRef = React.useRef<HTMLButtonElement>(null);
    const radioRefs = React.useRef<(HTMLInputElement | null)[]>([]);
    const indiceFocoRef = React.useRef(0);

    const manejarTecla = (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            setAbierto(false);
            botonRef.current?.focus();
            return;
        }
        if (!abierto) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            const siguiente = (indiceFocoRef.current + 1) % OPCIONES.length;
            indiceFocoRef.current = siguiente;
            radioRefs.current[siguiente]?.focus();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            const anterior = (indiceFocoRef.current - 1 + OPCIONES.length) % OPCIONES.length;
            indiceFocoRef.current = anterior;
            radioRefs.current[anterior]?.focus();
        } else if (e.key === "Enter" || e.key === " ") {
            const target = e.target as HTMLInputElement;
            if (target.type === "radio") {
                e.preventDefault();
                elegir(target.value as EleccionDiseno);
            }
        }
    };

    const elegir = (opcion: EleccionDiseno) => {
        onCambiar(opcion);
        setAbierto(false);
        botonRef.current?.focus();
    };

    const handleRadioFocus = (index: number) => {
        indiceFocoRef.current = index;
    };

    return (
        <Popover open={abierto} onOpenChange={setAbierto}>
            <PopoverTrigger asChild>
                <button
                    ref={botonRef}
                    type="button"
                    className="cursor-pointer ss-redondo min-h-11 min-w-11 grid place-items-center rounded-full transition-transform duration-200 hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
                    style={{ background: "#7c5cff1f", boxShadow: "inset 0 0 0 1px #7c5cff59", minHeight: 44, minWidth: 44 }}
                    aria-label="Abrir selector de diseño"
                    aria-expanded={abierto}
                    aria-haspopup="dialog"
                >
                    <LayoutDashboard className="size-5" aria-hidden="true" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                className="w-72 p-3"
                align="end"
                sideOffset={8}
                onKeyDown={manejarTecla}
                role="dialog"
                aria-label="Seleccionar diseño del widget"
            >
                <div className="flex flex-col gap-1.5">
                    <div role="radiogroup" aria-label="Diseño del widget" className="flex flex-col gap-1">
                        {OPCIONES.map((op, index) => {
                            const esAuto = op === "auto";
                            const etiqueta = esAuto ? "Automático (según el tamaño y el aparato)" : DISENOS[op].nombre;
                            const descripcion = esAuto
                                ? "El diseño se adapta solo al tamaño del widget y al dispositivo"
                                : DISENOS[op].sirvePara;
                            const descId = `desc-${op}`;

                            return (
                                <label
                                    key={op}
                                    className="cursor-pointer flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 transition-colors"
                                >
                                    <input
                                        ref={(el) => { radioRefs.current[index] = el; }}
                                        type="radio"
                                        name="diseno-astraura"
                                        value={op}
                                        checked={valor === op}
                                        onChange={() => elegir(op)}
                                        onFocus={() => handleRadioFocus(index)}
                                        className="sr-only"
                                        aria-describedby={descId}
                                    />
<span className="flex items-center gap-2">
                                        {!esAuto && React.createElement(ICONOS[op as Exclude<EleccionDiseno, "auto">], { className: "size-4 text-white/70", "aria-hidden": "true" })}
                                        <span className="font-medium text-white">{etiqueta}</span>
                                    </span>
                                    <span id={descId} className="text-[11px] text-white/50 ml-auto max-w-[180px]">
                                        {descripcion}
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                    {degradado && (
                        <div
                            role="status"
                            aria-label="pequeño: se muestra el diseño Mínimo"
                            className="text-[11px] text-amber-200/90 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/20"
                            aria-live="polite"
                        >
                            Este tamaño es pequeño: se muestra el diseño Mínimo; agranda el widget para ver el elegido.
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

export default SelectorDisenoAstraura;