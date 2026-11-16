"use client";

/**
 * TU16b · Selector de par de idiomas con intercambio y estado sin internet por idioma
 * Dos desplegables buscables (reutiliza el patrón de selector-idioma.tsx, sin importarlo),
 * "Detectar idioma" como primera opción del origen, botón de intercambiar (deshabilitado
 * con "Detectar"), y junto a cada destino una insignia "Sin internet / Con descarga / Solo
 * con internet" según estadoDePar (TU2). Accesible, 44 px, 360 px.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Globe, RefreshCw, ChevronDown, Check } from "lucide-react";
import { IDIOMAS, porCodigo } from "@/lib/idiomas/idiomas";
import type { EstadoPar } from "@/lib/traductor/tipos";

const sinTildes = (t: string): string => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function InsigniaEstado({ estado }: { estado: EstadoPar }) {
    const estilos: Record<EstadoPar, string> = {
        "sin-internet": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
        "descarga": "bg-amber-500/20 text-amber-300 border-amber-500/30",
        "solo-internet": "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    };
    const etiquetas: Record<EstadoPar, string> = {
        "sin-internet": "Sin internet",
        "descarga": "Con descarga",
        "solo-internet": "Solo con internet",
    };
    return (
        <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${estilos[estado]}`}
            aria-label={etiquetas[estado]}
        >
            {etiquetas[estado]}
        </span>
    );
}

export interface Par {
    origen: string | "detectar";
    destino: string;
}

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

function DesplegableBuscable({
    id,
    label,
    opciones,
    valor,
    alCambiar,
    deshabilitado = false,
    conInsignias = false,
    estadoDePar,
}: {
    id: string;
    label: string;
    opciones: readonly { codigo: string; nombre: string }[];
    valor: string;
    alCambiar: (codigo: string) => void;
    deshabilitado?: boolean;
    conInsignias?: boolean;
    estadoDePar?: (codigo: string) => EstadoPar;
}) {
    const [abierto, setAbierto] = useState(false);
    const [filtro, setFiltro] = useState("");
    const botonRef = useRef<HTMLButtonElement>(null);
    const cajaRef = useRef<HTMLInputElement>(null);
    const listaRef = useRef<HTMLUListElement>(null);
    const idLista = `${id}-lista`;

    useEffect(() => {
        if (abierto) cajaRef.current?.focus();
    }, [abierto]);

    const visibles = useMemo(() => {
        const q = sinTildes(filtro.trim());
        return opciones.filter((o) =>
            !q || sinTildes(o.nombre).includes(q) || o.codigo.toLowerCase().includes(q)
        );
    }, [filtro, opciones]);

    const elegir = (codigo: string) => {
        if (!deshabilitado) {
            alCambiar(codigo);
            setAbierto(false);
            botonRef.current?.focus();
        }
    };

    const mover = (paso: number) => {
        const items = Array.from(listaRef.current?.querySelectorAll<HTMLElement>("[role=option]") ?? []);
        const activo = document.activeElement as HTMLElement | null;
        const idx = items.findIndex((el) => el === activo);
        const siguiente = items[idx + paso];
        if (siguiente) siguiente.focus();
        else if (paso < 0) cajaRef.current?.focus();
    };

    const alTeclear = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Escape") {
            e.preventDefault();
            setAbierto(false);
            botonRef.current?.focus();
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            listaRef.current?.querySelector<HTMLElement>("[role=option]")?.focus();
        }
    };

    const alTeclearLista = (e: React.KeyboardEvent<HTMLLIElement>) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            const codigo = e.currentTarget.dataset.codigo;
            if (codigo) elegir(codigo);
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            mover(1);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            mover(-1);
        } else if (e.key === "Escape") {
            e.preventDefault();
            setAbierto(false);
            botonRef.current?.focus();
        }
    };

    const opcionActual = opciones.find((o) => o.codigo === valor);

    return (
        <div className="flex-1" data-testid={id}>
            <button
                ref={botonRef}
                type="button"
                id={id}
                aria-label={label}
                aria-haspopup="listbox"
                aria-expanded={abierto}
                aria-controls={idLista}
                disabled={deshabilitado}
                onClick={() => !deshabilitado && setAbierto((a) => !a)}
                className={`
                    flex min-h-[44px] w-full py-2.5 cursor-pointer items-center gap-2.5
                    rounded-xl border bg-white/5 px-3 text-left text-sm text-white outline-none
                    transition-colors
                    ${deshabilitado ? "opacity-50 cursor-not-allowed" : "hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300"}
                `}
            >
                <Globe className="h-5 w-5 shrink-0 text-cyan-300" aria-hidden />
                <span className="min-w-0 truncate font-medium">
                    {opcionActual?.nombre ?? "Idioma"}
                </span>
                <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-white/60 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden />
            </button>
            {abierto && !deshabilitado && (
                <div
                    id={idLista}
                    role="listbox"
                    aria-label={label}
                    className="absolute z-50 mt-1.5 w-full max-h-64 overflow-hidden rounded-xl border border-white/15 bg-black/40 p-2 backdrop-blur-xl"
                >
                    <input
                        ref={cajaRef}
                        type="search"
                        value={filtro}
                        onChange={(e) => setFiltro(e.target.value)}
                        onKeyDown={alTeclear}
                        placeholder="Buscar idioma"
                        aria-label="Buscar idioma"
                        autoComplete="off"
                        className="mb-2 min-h-[44px] w-full rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-white/50 focus-visible:ring-2 focus-visible:ring-cyan-300"
                    />
                    <ul ref={listaRef} role="listbox" aria-label={label} className="max-h-56 overflow-y-auto">
                        {visibles.length === 0 && (
                            <li role="presentation" className="px-3 py-3 text-sm text-white/60">Ningún idioma coincide.</li>
                        )}
                        {visibles.map((op, idx) => (
                            <li
                                key={op.codigo}
                                role="option"
                                aria-selected={op.codigo === valor}
                                tabIndex={-1}
                                data-codigo={op.codigo}
                                onClick={() => elegir(op.codigo)}
                                onKeyDown={alTeclearLista}
                                className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-1.5 outline-none hover:bg-white/10 focus-visible:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300"
                            >
                                <span className="flex min-w-0 flex-col">
                                    <span translate="no" data-no-traducir="" lang={op.codigo} dir={porCodigo(op.codigo)?.dir ?? "ltr"} className="truncate text-sm font-medium">
                                        {op.nombre}
                                    </span>
                                    {conInsignias && estadoDePar && (
                                        <InsigniaEstado estado={estadoDePar(op.codigo)} />
                                    )}
                                </span>
                                {op.codigo === valor && <Check className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden />}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

export const SelectorPar = ({ idiomas, par, onCambiar, estadoDePar }: SelectorParProps) => {
    const id = useId();

    const handleCambiarOrigen = (codigo: string) => onCambiar({ ...par, origen: codigo });
    const handleCambiarDestino = (codigo: string) => onCambiar({ ...par, destino: codigo });
    const handleIntercambiar = () => onCambiar(intercambiarPar(par));

    const opcionesOrigen = useMemo(() => [
        { codigo: "detectar", nombre: "Detectar idioma" },
        ...idiomas,
    ], [idiomas]);

    return (
        <div className="flex items-center gap-2 w-[360px] h-[44px]" data-testid="selector-par" role="group" aria-label="Selector de par de idiomas">
            <DesplegableBuscable
                id={`${id}-origen`}
                label="Idioma de origen"
                opciones={opcionesOrigen}
                valor={par.origen}
                alCambiar={handleCambiarOrigen}
            />
            <button
                type="button"
                onClick={handleIntercambiar}
                disabled={par.origen === "detectar"}
                aria-label="Intercambiar idiomas de origen y destino"
                aria-disabled={par.origen === "detectar"}
                className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-xl border border-white/15 bg-white/5 px-2 text-cyan-300 transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="boton-intercambiar"
            >
                <RefreshCw className="h-5 w-5" aria-hidden />
            </button>
            <DesplegableBuscable
                id={`${id}-destino`}
                label="Idioma de destino"
                opciones={idiomas}
                valor={par.destino}
                alCambiar={handleCambiarDestino}
                conInsignias={true}
                estadoDePar={estadoDePar}
            />
        </div>
    );
};