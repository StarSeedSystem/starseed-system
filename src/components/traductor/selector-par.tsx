import * as React from "react";
// Importaciones de UI simuladas para cumplir con el contrato visual
// (No podemos usar shadcn real aquí sin saber los nombres de archivos exactos, 
// pero usaremos clases de Tailwind)

export interface Par {
    origen: string | "detectar";
    destino: string;
}

export type EstadoPar = "sin-internet" | "con-descarga" | "solo-internet";

export interface SelectorParProps {
    idiomas: readonly { codigo: string; nombre: string }[];
    par: Par;
    onCambiar: (par: Par) => void;
    estadoDePar: (codigo: string) => EstadoPar;
}

export const intercambiarPar = (par: Par): Par => {
    if (par.origen === "detectar") return par;
    return { origen: par.destino, destino: par.origen };
};

export const SelectorPar = ({ idiomas, par, onCambiar, estadoDePar }: SelectorParProps) => {
    const handleIntercambiar = () => {
        onCambiar(intercambiarPar(par));
    };

    return (
        <div className="flex items-center gap-2 w-[360px] h-[44px]">
            {/* Origen */}
            <select
                value={par.origen}
                onChange={(e) => onCambiar({ ...par, origen: e.target.value })}
                className="cursor-pointer"
            >
                <option value="detectar">Detectar idioma</option>
                {idiomas.map((i) => (
                    <option key={i.codigo} value={i.codigo}>{i.nombre}</option>
                ))}
            </select>

            {/* Intercambiar */}
            <button
                onClick={handleIntercambiar}
                disabled={par.origen === "detectar"}
                className="cursor-pointer disabled:opacity-50"
            >
                ↔
            </button>

            {/* Destino */}
            <select
                value={par.destino}
                onChange={(e) => onCambiar({ ...par, destino: e.target.value })}
                className="cursor-pointer"
            >
                {idiomas.map((i) => (
                    <option key={i.codigo} value={i.codigo}>
                        {i.nombre} ({estadoDePar(i.codigo)})
                    </option>
                ))}
            </select>
        </div>
    );
};
