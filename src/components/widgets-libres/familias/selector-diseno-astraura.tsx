"use client";
import * as React from "react";
import { LayoutDashboard, X } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { DISENOS, type EleccionDiseno } from "@/lib/widgets/astraura/disenos";

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
    const radiosRef = React.useRef<HTMLInputElement[]>([]);

    const opciones: EleccionDiseno[] = ["auto", "minimo", "conversacion", "acciones", "voz"];

    const indiceActual = opciones.indexOf(valor);

    const manejarTecla = (e: React.KeyboardEvent<HTMLInputElement>, indice: number) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            const siguiente = (indice + 1) % opciones.length;
            radiosRef.current[siguiente]?.focus();
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            const anterior = (indice - 1 + opciones.length) % opciones.length;
            radiosRef.current[anterior]?.focus();
        } else if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            const elegido = opciones[indice];
            onCambiar(elegido);
            setAbierto(false);
            botonRef.current?.focus();
        } else if (e.key === "Escape") {
            e.preventDefault();
            setAbierto(false);
            botonRef.current?.focus();
        }
    };

    return (
        <Popover open={abierto} onOpenChange={setAbierto}>
            <PopoverTrigger asChild>
                <button
                    ref={botonRef}
                    type="button"
                    aria-label="Diseño"
                    aria-haspopup="dialog"
                    aria-expanded={abierto}
                    className="ss-redondo cursor-pointer size-11 grid place-items-center rounded-full text-white transition-transform duration-200 hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
                    style={{ background: "#7c5cff1f", boxShadow: "inset 0 0 0 1px #7c5cff59" }}
                >
                    <LayoutDashboard className="size-5" aria-hidden />
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                sideOffset={8}
                className="w-72 p-2"
                aria-label="Diseño"
                onKeyDown={(e) => {
                    if (e.key === "Escape") {
                        setAbierto(false);
                        botonRef.current?.focus();
                    }
                }}
            >
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-[13px] font-semibold text-white">Diseño</h2>
                    <button
                        type="button"
                        onClick={() => setAbierto(false)}
                        className="cursor-pointer rounded-full p-1 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                        aria-label="Cerrar"
                    >
                        <X className="size-4" />
                    </button>
                </div>
                {degradado && (
                    <div role="status" aria-label="Este tamaño es pequeño: se muestra el diseño Mínimo; agranda el widget para ver el elegido." className="mb-2 text-[11.5px] text-amber-200/90">
                        Este tamaño es pequeño: se muestra el diseño Mínimo; agranda el widget para ver el elegido.
                    </div>
                )}
                <fieldset className="flex flex-col gap-1">
                    <legend className="sr-only">Elegir diseño</legend>
                    <div role="radiogroup" aria-label="Diseño del widget">
                        {opciones.map((opcion, i) => {
                            const esAuto = opcion === "auto";
                            const info = esAuto
                                ? { nombre: "Automático (según el tamaño y el aparato)", sirvePara: "El sistema elige según el espacio, el dispositivo y si hay conversación o voz disponible" }
                                : DISENOS[opcion as keyof typeof DISENOS];
                            const descripcionId = `desc-diseno-${opcion}`;
                            return (
                                <label key={opcion} className="cursor-pointer">
                                    <input
                                        type="radio"
                                        name="diseno-astraura"
                                        value={opcion}
                                        checked={valor === opcion}
                                        onChange={() => {
                                            onCambiar(opcion);
                                            setAbierto(false);
                                            botonRef.current?.focus();
                                        }}
                                        onKeyDown={(e) => manejarTecla(e, i)}
                                        ref={(el) => { if (el) radiosRef.current[i] = el; }}
                                        className="sr-only"
                                        aria-describedby={descripcionId}
                                    />
                                    <div
                                        className={`flex items-start gap-2 rounded-lg p-2 transition-colors ${
                                            valor === opcion
                                                ? "bg-violet-500/20 ring-1 ring-violet-400/50"
                                                : "hover:bg-white/5"
                                        }`}
                                        role="radio"
                                        aria-checked={valor === opcion}
                                        tabIndex={-1}
                                    >
                                        <span className="font-medium text-white">{info.nombre}</span>
                                        <span id={descripcionId} className="text-[11.5px] text-white/60 leading-snug">
                                            {info.sirvePara}
                                        </span>
                                    </div>
                                </label>
                            );
                        })}
                    </div>
                </fieldset>
            </PopoverContent>
        </Popover>
    );
}