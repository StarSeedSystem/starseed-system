"use client";

import * as React from "react";
import { LayoutDashboard, Mic, MessageSquare, Bot, Sparkles } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { DISENOS, type EleccionDiseno } from "@/lib/widgets/astraura/disenos";

function IconoPara(opcion: EleccionDiseno) {
    switch (opcion) {
        case "auto":
            return <LayoutDashboard aria-hidden className="size-5" />;
        case "minimo":
            return <Bot aria-hidden className="size-5" />;
        case "conversacion":
            return <MessageSquare aria-hidden className="size-5" />;
        case "acciones":
            return <Sparkles aria-hidden className="size-5" />;
        case "voz":
            return <Mic aria-hidden className="size-5" />;
    }
}

const DESCRIPCIONES_ID: Record<EleccionDiseno, string> = {
    auto: "desc-auto",
    minimo: "desc-minimo",
    conversacion: "desc-conversacion",
    acciones: "desc-acciones",
    voz: "desc-voz",
};

export function SelectorDisenoAstraura({
    valor,
    onCambiar,
    degradado,
}: {
    valor: EleccionDiseno;
    onCambiar: (e: EleccionDiseno) => void;
    degradado: boolean;
}) {
    const [abierto, setAbierto] = React.useState(false);
    const botonRef = React.useRef<HTMLButtonElement>(null);
    const radiosRef = React.useRef<(HTMLInputElement | null)[]>([]);
    const indiceActual = React.useRef(0);

    const opciones: EleccionDiseno[] = ["auto", "minimo", "conversacion", "acciones", "voz"];

    React.useEffect(() => {
        if (abierto) {
            const idx = opciones.indexOf(valor);
            if (idx >= 0) {
                indiceActual.current = idx;
                radiosRef.current[idx]?.focus();
            }
        }
    }, [abierto, valor]);

    const manejarTecla = (e: React.KeyboardEvent, idx: number) => {
        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                indiceActual.current = (idx + 1) % opciones.length;
                radiosRef.current[indiceActual.current]?.focus();
                break;
            case "ArrowUp":
                e.preventDefault();
                indiceActual.current = (idx - 1 + opciones.length) % opciones.length;
                radiosRef.current[indiceActual.current]?.focus();
                break;
            case "Enter":
            case " ":
                e.preventDefault();
                onCambiar(opciones[idx]);
                setAbierto(false);
                break;
            case "Escape":
                e.preventDefault();
                setAbierto(false);
                break;
        }
    };

    const cerrarYEnfocar = () => {
        setAbierto(false);
        botonRef.current?.focus();
    };

    return (
        <Popover open={abierto} onOpenChange={setAbierto}>
            <PopoverTrigger asChild>
                <button
                    ref={botonRef}
                    type="button"
                    aria-haspopup="dialog"
                    aria-label="Diseño"
                    className={cn(
                        "ss-redondo cursor-pointer grid place-items-center rounded-full transition-transform duration-200 hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                        "size-11",
                        "text-white/80 hover:text-white"
                    )}
                    style={{ background: "rgba(124, 92, 255, 0.12)", boxShadow: "inset 0 0 0 1px rgba(124, 92, 255, 0.35)" }}
                >
                    {IconoPara(valor)}
                </button>
            </PopoverTrigger>
            <PopoverContent
                className={cn(
                    "w-72 p-2",
                    "data-[side=bottom]:slide-in-from-top-2",
                    "data-[state=open]:animate-in",
                    "data-[state=closed]:animate-out"
                )}
                align="end"
                sideOffset={8}
            >
                <div role="dialog" aria-label="Diseño" tabIndex={-1}>
                    <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">
                        Diseño del widget
                    </div>
                    {degradado && (
                        <div role="status" aria-label="Aviso de tamaño degradado" className="mb-2 px-2 py-1.5 text-[11px] text-amber-200/90 bg-amber-500/10 rounded-lg border border-amber-500/20" aria-live="polite">
                            Este tamaño es pequeño: se muestra el diseño Mínimo; agranda el widget para ver el elegido.
                        </div>
                    )}
                    <div role="radiogroup" aria-label="Opciones de diseño" className="flex flex-col gap-1">
                        {opciones.map((opcion, idx) => {
                            const descId = DESCRIPCIONES_ID[opcion];
                            const estaSeleccionado = valor === opcion;
                            const nombre = DISENOS[opcion as keyof typeof DISENOS]?.nombre ?? opcion;
                            return (
                                <div
                                    key={opcion}
                                    className={cn(
                                        "ss-redondo cursor-pointer flex items-center gap-3 rounded-lg px-3 py-2.5 transition-[background-color,box-shadow] duration-200",
                                        "hover:bg-white/5 focus-within:bg-white/5",
                                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400",
                                        estaSeleccionado ? "bg-violet-500/15 ring-1 ring-violet-400/30" : ""
                                    )}
                                >
                                    <input
                                        type="radio"
                                        name="diseno-astraura"
                                        value={opcion}
                                        checked={estaSeleccionado}
                                        onChange={() => {
                                            onCambiar(opcion);
                                            cerrarYEnfocar();
                                        }}
                                        onKeyDown={(e) => manejarTecla(e, idx)}
                                        ref={(el) => { radiosRef.current[idx] = el; }}
                                        className="sr-only"
                                        aria-describedby={descId}
                                        id={`radio-${opcion}`}
                                    />
                                    <label htmlFor={`radio-${opcion}`} className="flex items-center gap-3 cursor-pointer flex-1">
                                        {IconoPara(opcion)}
                                        <span className="font-medium text-white">{nombre}</span>
                                    </label>
                                    <span id={descId} className="ml-auto text-[11px] text-white/50">
                                        {DISENOS[opcion as keyof typeof DISENOS]?.sirvePara}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

export default SelectorDisenoAstraura;