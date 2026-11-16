"use client";

import { ChevronDown, Globe, RotateCw } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { type EstadoPar, estadoDePar } from "@/lib/traductor/modelos-locales";
import { porCodigo, type Idioma } from "@/lib/idiomas/idiomas";

export interface SelectorParProps {
    idiomas: readonly Idioma[];
    par: { origen: string; destino: string } | null;
    onCambiar: (par: { origen: string; destino: string }) => void;
    instalados: readonly string[];
}

const ESTADO_LABEL: Record<EstadoPar, string> = {
    "sin-internet": "Sin internet",
    descarga: "Con descarga",
    "solo-internet": "Solo con internet",
};

const ESTADO_COLOR: Record<EstadoPar, string> = {
    "sin-internet": "text-emerald-300",
    descarga: "text-amber-300",
    "solo-internet": "text-red-300",
};

function InsigniaEstado({ estado }: { estado: EstadoPar }) {
    const color = ESTADO_COLOR[estado];
    const label = ESTADO_LABEL[estado];
    return (
        <span className={`flex items-center gap-1 text-xs ${color}`} aria-label={label}>
            <span className="size-2 rounded-full bg-current/50" />
            {label}
        </span>
    );
}

function BusquedaIdioma({
    value,
    onChange,
    placeholder = "Buscar idioma",
    ariaLabel = "Buscar idioma",
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    ariaLabel?: string;
}) {
    return (
        <input
            type="search"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            aria-label={ariaLabel}
            autoComplete="off"
            className="mb-2 min-h-[44px] w-full rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-white/50 focus-visible:ring-2 focus-visible:ring-cyan-300"
        />
    );
}

export function SelectorPar({ idiomas, par, onCambiar, instalados }: SelectorParProps) {
    const id = useId();
    const [abiertoOrigen, setAbiertoOrigen] = useState(false);
    const [abiertoDestino, setAbiertoDestino] = useState(false);
    const [filtroOrigen, setFiltroOrigen] = useState("");
    const [filtroDestino, setFiltroDestino] = useState("");
    const [detectando, setDetectando] = useState(false);

    const origenSeleccionado = par?.origen ?? null;
    const destinoSeleccionado = par?.destino ?? null;

    const estadoOrigen = useMemo(() => {
        if (!origenSeleccionado) return null;
        return estadoDePar(origenSeleccionado, destinoSeleccionado ?? "", instalados);
    }, [origenSeleccionado, destinoSeleccionado, instalados]);

    const estadoDestino = useMemo(() => {
        if (!destinoSeleccionado) return null;
        return estadoDePar(origenSeleccionado ?? "", destinoSeleccionado, instalados);
    }, [origenSeleccionado, destinoSeleccionado, instalados]);

    const esDetectar = (i: Idioma) => i.codigo === "detect";

    const idiomasVisiblesOrigen = useMemo(() => {
        const q = filtroOrigen.trim().toLowerCase();
        const coincide = (i: Idioma): boolean => {
            if (esDetectar(i)) return true;
            return !q || i.nombre.toLowerCase().includes(q) || i.codigo.toLowerCase().includes(q);
        };
        const detectarItem: Idioma = { codigo: "detect", nombre: "Detectar idioma", rotulo: "Detectar idioma", dir: "ltr" };
        const otros = idiomas.filter(coincide);
        if (!abiertoOrigen) return [];
        if (esDetectar(idiomasVisiblesOrigen[0] as Idioma)) return [detectarItem, ...otros];
        return [detectarItem, ...otros];
    }, [filtroOrigen, abiertoOrigen, idiomas]);

    const idiomasVisiblesDestino = useMemo(() => {
        if (!origenSeleccionado) return [];
        const q = filtroDestino.trim().toLowerCase();
        return idiomas.filter((i) => {
            if (esDetectar(i)) return true;
            return i.codigo.toLowerCase().includes(q) || i.nombre.toLowerCase().includes(q);
        });
    }, [filtroDestino, idiomas, origenSeleccionado]);

    const handleOrigenChange = (codigo: string) => {
        if (codigo === "detect") {
            setDetectando(true);
            navigator.language && onCambiar({ origen: navigator.language.split("-")[0], destino: destinoSeleccionado ?? "en" });
            setTimeout(() => setDetectando(false), 1000);
            return;
        }
        onCambiar({ origen: codigo, destino: destinoSeleccionado ?? "en" });
        setFiltroOrigen("");
        setAbiertoOrigen(false);
    };

    const handleDestinoChange = (codigo: string) => {
        if (codigo === "detect") {
            setDetectando(true);
            navigator.language && onCambiar({ origen: origenSeleccionado ?? "es", destino: navigator.language.split("-")[0] });
            setTimeout(() => setDetectando(false), 1000);
            return;
        }
        onCambiar({ origen: origenSeleccionado ?? "es", destino: codigo });
        setFiltroDestino("");
        setAbiertoDestino(false);
    };

    const handleIntercambiar = () => {
        if (origenSeleccionado && destinoSeleccionado) {
            onCambiar({ origen: destinoSeleccionado, destino: origenSeleccionado });
        }
    };

    const idiomaOrigen = origenSeleccionado ? porCodigo(origenSeleccionado) : null;
    const idiomaDestino = destinoSeleccionado ? porCodigo(destinoSeleccionado) : null;

    return (
        <div className="w-full max-w-[360px] space-y-3" data-testid="selector-par">
            <div className="space-y-2">
                <label htmlFor={`${id}-origen`} className="sr-only">
                    De
                </label>
                <div className="relative">
                    <button
                        type="button"
                        id={`${id}-origen`}
                        role="combobox"
                        aria-label="De idioma"
                        aria-haspopup="listbox"
                        aria-expanded={abiertoOrigen}
                        aria-controls={`${id}-panel-origen`}
                        onClick={() => setAbiertoOrigen(!abiertoOrigen)}
                        disabled={detectando}
                        className="flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-cyan-300/40 bg-cyan-300/10 px-3.5 text-left text-sm text-white outline-none transition-colors hover:bg-cyan-300/20 focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50"
                    >
                        <span className="flex min-w-0 items-center gap-2">
                            <Globe className="h-4 w-4 shrink-0 text-cyan-200" aria-hidden />
                            {idiomaOrigen ? (
                                <span lang={idiomaOrigen.codigo} dir={idiomaOrigen.dir} className="truncate">
                                    {idiomaOrigen.nombre}
                                </span>
                            ) : (
                                <span className="text-white/60">Seleccionar idioma origen</span>
                            )}
                        </span>
                        {estadoOrigen && <InsigniaEstado estado={estadoOrigen} />}
                        <ChevronDown
                            className={`h-4 w-4 shrink-0 transition-transform ${abiertoOrigen ? "rotate-180" : ""}`}
                            aria-hidden
                        />
                    </button>
                    {abiertoOrigen && (
                        <div
                            id={`${id}-panel-origen`}
                            data-testid="panel-origen"
                            role="listbox"
                            aria-label="Idiomas de origen"
                            className="absolute z-50 mt-2 max-h-64 w-full rounded-xl border border-white/15 bg-black/40 p-2"
                        >
                            <BusquedaIdioma value={filtroOrigen} onChange={setFiltroOrigen} ariaLabel="Buscar idioma origen" />
                            <ul className="max-h-48 overflow-y-auto" role="list">
                                {idiomasVisiblesOrigen.map((i, n) => (
                                    <li
                                        key={`o-${i.codigo}`}
                                        role="option"
                                        aria-selected={i.codigo === origenSeleccionado}
                                        tabIndex={-1}
                                        onClick={() => handleOrigenChange(i.codigo)}
                                        className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-1.5 hover:bg-white/10 focus:bg-white/10 focus:ring-2 focus:ring-cyan-300"
                                    >
                                        <span lang={i.codigo} dir={i.dir} className="truncate text-sm font-medium">
                                            {i.nombre}
                                        </span>
                                        {i.codigo !== "detect" && (
                                            <span className="text-xs text-white/50">{i.codigo}</span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex justify-center">
                <button
                    type="button"
                    onClick={handleIntercambiar}
                    disabled={!origenSeleccionado || !destinoSeleccionado || detectando}
                    className="flex size-10 cursor-pointer items-center justify-center rounded-full border border-amber-300/40 bg-amber-300/10 text-amber-300 transition-colors hover:bg-amber-300/20 focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Intercambiar idiomas"
                >
                    <RotateCw className="h-4 w-4" aria-hidden={!!(origenSeleccionado && destinoSeleccionado)} />
                </button>
            </div>

            <div className="space-y-2">
                <label htmlFor={`${id}-destino`} className="sr-only">
                    A
                </label>
                <div className="relative">
                    <button
                        type="button"
                        id={`${id}-destino`}
                        role="combobox"
                        aria-label="A idioma"
                        aria-haspopup="listbox"
                        aria-expanded={abiertoDestino}
                        aria-controls={`${id}-panel-destino`}
                        onClick={() => setAbiertoDestino(!abiertoDestino)}
                        disabled={detectando}
                        className="flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-cyan-300/40 bg-cyan-300/10 px-3.5 text-left text-sm text-white outline-none transition-colors hover:bg-cyan-300/20 focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50"
                    >
                        <span className="flex min-w-0 items-center gap-2">
                            <Globe className="h-4 w-4 shrink-0 text-cyan-200" aria-hidden />
                        </span>
                        {idiomaDestino ? (
                            <span lang={idiomaDestino.codigo} dir={idiomaDestino.dir} className="truncate">
                                <span className="flex items-center gap-2">
                                    {idiomaDestino.nombre}
                                    {estadoDestino && (
                                        <span className={`flex items-center gap-1 text-xs ${ESTADO_COLOR[estadoDestino]}`}>
                                            <span className="size-2 rounded-full bg-current/50" />
                                            {ESTADO_LABEL[estadoDestino]}
                                        </span>
                                    )}
                                </span>
                            </span>
                        ) : (
                            <span className="text-white/60">Seleccionar idioma destino</span>
                        )}
                        <ChevronDown
                            className={`h-4 w-4 shrink-0 transition-transform ${abiertoDestino ? "rotate-180" : ""}`}
                            aria-hidden
                        />
                    </button>
                    {abiertoDestino && origenSeleccionado && (
                        <div
                            id={`${id}-panel-destino`}
                            data-testid="panel-destino"
                            role="listbox"
                            aria-label="Idiomas de destino"
                            className="absolute z-50 mt-2 max-h-64 w-full rounded-xl border border-white/15 bg-black/40 p-2"
                        >
                            <BusquedaIdioma value={filtroDestino} onChange={setFiltroDestino} ariaLabel="Buscar idioma destino" />
                            <ul className="max-h-48 overflow-y-auto" role="list">
                                {idiomasVisiblesDestino.map((i, n) => (
                                    <li
                                        key={`d-${i.codigo}`}
                                        role="option"
                                        aria-selected={i.codigo === destinoSeleccionado}
                                        tabIndex={-1}
                                        onClick={() => handleDestinoChange(i.codigo)}
                                        className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-1.5 hover:bg-white/10 focus:bg-white/10 focus:ring-2 focus:ring-cyan-300"
                                    >
                                        <span lang={i.codigo} dir={i.dir} className="truncate text-sm font-medium">
                                            {i.nombre}
                                        </span>
                                        {i.codigo !== "detect" && idiomaOrigen && (
                                            <span className="flex items-center gap-1 text-xs">
                                                <span className="size-2 rounded-full bg-white/30" />
                                                <span className="sr-only">Estado:</span>
                                                {(() => {
                                                    const st = estadoDePar(origenSeleccionado, i.codigo, instalados);
                                                    return (
                                                        <span className={ESTADO_COLOR[st]}>
                                                            {ESTADO_LABEL[st]}
                                                        </span>
                                                    );
                                                })}()
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}