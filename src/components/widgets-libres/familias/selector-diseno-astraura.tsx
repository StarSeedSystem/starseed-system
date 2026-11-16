"use client";

import * as React from "react";
import { LayoutDashboard } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { DISENOS, type EleccionDiseno } from "@/lib/widgets/astraura/disenos";

interface SelectorDisenoAstrauraProps {
    valor: EleccionDiseno;
    onCambiar: (e: EleccionDiseno) => void;
    degradado: boolean;
}

export function SelectorDisenoAstraura({ valor, onCambiar, degradado }: SelectorDisenoAstrauraProps) {
    const [abierto, setAbierto] = React.useState(false);
    const [seleccionFocus, setSeleccionFocus] = React.useState<EleccionDiseno>(valor);
    const botonRef = React.useRef<HTMLButtonElement>(null);
    const opcionesRef = React.useRef<(HTMLInputElement | null)[]>([]);

    const opciones: EleccionDiseno[] = ["auto", "minimo", "conversacion", "acciones", "voz"];

    const manejarTeclaBoton = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setAbierto(true);
            setSeleccionFocus(valor);
        }
    };

    const manejarTeclaDialog = (e: React.KeyboardEvent) => {
        const idxActual = opciones.indexOf(seleccionFocus);
        if (e.key === "ArrowDown") {
            e.preventDefault();
            const siguiente = opciones[(idxActual + 1) % opciones.length];
            setSeleccionFocus(siguiente);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            const anterior = opciones[(idxActual - 1 + opciones.length) % opciones.length];
            setSeleccionFocus(anterior);
        } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onCambiar(seleccionFocus);
            setAbierto(false);
            botonRef.current?.focus();
        } else if (e.key === "Escape") {
            setAbierto(false);
            botonRef.current?.focus();
        }
    };

    const opcionesConDescripcion = opciones.map((opcion, i) => {
        const idDescripcion = `descripcion-${opcion}`;
        return (
            <div key={opcion} className="flex items-start gap-3">
                <input
                    type="radio"
                    id={opcion}
                    name="diseno-astraura"
                    value={opcion}
                    checked={seleccionFocus === opcion}
                    onChange={() => setSeleccionFocus(opcion)}
                    ref={(el) => { opcionesRef.current[i] = el; }}
                    className="sr-only"
                    aria-describedby={idDescripcion}
                />
                <label htmlFor={opcion} className="cursor-pointer flex flex-col gap-0.5">
                    <span className="font-medium text-white">{opcion === "auto" ? "Automático (según el tamaño y el aparato)" : DISENOS[opcion as keyof typeof DISENOS].nombre}</span>
                    <span id={idDescripcion} className="text-[11px] text-white/60">
                        {opcion === "auto" ? "Elige el diseño óptimo según el espacio y el dispositivo" : DISENOS[opcion as keyof typeof DISENOS].sirvePara}
                    </span>
                </label>
            </div>
        );
    });

    React.useEffect(() => {
        if (abierto) {
            const idx = opciones.indexOf(seleccionFocus);
            if (idx >= 0 && opcionesRef.current[idx]) {
                opcionesRef.current[idx]?.focus();
            }
        }
    }, [abierto, seleccionFocus]);

    return (
        <Popover open={abierto} onOpenChange={setAbierto}>
            <PopoverTrigger asChild>
                <button
                    ref={botonRef}
                    type="button"
                    aria-label="Diseño"
                    className="ss-redondo cursor-pointer grid place-items-center rounded-full size-11 transition-transform duration-200 hover:scale-105 focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                    style={{ background: "#7c5cff1f", boxShadow: "inset 0 0 0 1px #7c5cff59" }}
                    onKeyDown={manejarTeclaBoton}
                >
                    <LayoutDashboard className="size-5 text-violet-300" aria-hidden="true" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                role="dialog"
                aria-modal="true"
                className="w-80 p-4 bg-black/95 backdrop-blur-sm border-violet-500/30 shadow-xl"
                align="end"
                sideOffset={8}
                onKeyDown={manejarTeclaDialog}
            >
                <h2 id="titulo-diseno" className="sr-only">Seleccionar diseño</h2>
                <div role="radiogroup" aria-labelledby="titulo-diseno" className="flex flex-col gap-3">
                    {opcionesConDescripcion}
                </div>
                {degradado && (
                    <div role="status" className="mt-3 text-[11px] text-amber-200/90" aria-live="polite">
                        Este tamaño es pequeño: se muestra el diseño Mínimo; agranda el widget para ver el elegido.
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}