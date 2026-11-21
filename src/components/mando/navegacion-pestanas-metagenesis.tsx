"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MenuListaMovil } from "@/components/ui/menu-lista-movil";

export interface DefinicionPestana {
    readonly id: string;
    readonly etiqueta: string;
    readonly grupo: string;
}

export interface NavegacionPestanasMetaGenesisProps {
    pestanas: readonly DefinicionPestana[];
    grupos: readonly string[];
    pestanaActiva: string;
    alCambiarPestana: (id: string) => void;
    etiquetaPliegue: string;
    todoPlegado: boolean;
    alAlternarPliegue: () => void;
    renderInsignia?: (id: string) => ReactNode;
}

/**
 * Navegación aerodinámica de MetaGenesis:
 *   1. Selector de familia en una fila limpia (Trabajo, Publicación, Medios, Agentes, Comunidad, Infraestructura, Ajustes).
 *   2. Fila única horizontal (`TabsList`) con las pestañas de la familia activa (o todas las coincidencias de búsqueda)
 *      y navegación por teclado nativa de Radix Tabs.
 *   3. Búsqueda rápida por nombre + control central «Plegar todo / Desplegar todo».
 */
export function NavegacionPestanasMetaGenesis({
    pestanas,
    grupos,
    pestanaActiva,
    alCambiarPestana,
    etiquetaPliegue,
    todoPlegado,
    alAlternarPliegue,
    renderInsignia,
}: NavegacionPestanasMetaGenesisProps) {
    const [busqueda, setBusqueda] = useState("");
    const grupoActual = pestanas.find((p) => p.id === pestanaActiva)?.grupo ?? grupos[0] ?? "Trabajo";
    const [grupoSeleccionado, setGrupoSeleccionado] = useState<string>(grupoActual);

    const grupoVisible = grupos.includes(grupoSeleccionado) ? grupoSeleccionado : grupoActual;
    const grupoDeActiva = grupoActual;
    const grupoEfectivo = busqueda.trim() ? grupoVisible : grupoDeActiva || grupoVisible;

    const opcionesMovil = useMemo(
        () => pestanas.map((p) => ({ id: p.id, label: p.etiqueta, hint: p.grupo })),
        [pestanas],
    );

    const visibles = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        if (q) {
            return pestanas.filter(
                (p) =>
                    p.etiqueta.toLowerCase().includes(q) ||
                    p.grupo.toLowerCase().includes(q) ||
                    p.id.toLowerCase().includes(q),
            );
        }
        return pestanas.filter((p) => p.grupo === grupoEfectivo);
    }, [busqueda, grupoEfectivo, pestanas]);

    const seleccionarGrupo = (g: string) => {
        setGrupoSeleccionado(g);
        setBusqueda("");
        const actualEnGrupo = pestanas.some((p) => p.id === pestanaActiva && p.grupo === g);
        if (!actualEnGrupo) {
            const primera = pestanas.find((p) => p.grupo === g);
            if (primera) alCambiarPestana(primera.id);
        }
    };

    return (
        <div className="flex flex-col gap-2" data-testid="navegacion-pestanas-metagenesis">
            <div className="flex sm:hidden">
                <MenuListaMovil
                    opciones={opcionesMovil}
                    valor={pestanaActiva}
                    onCambiar={alCambiarPestana}
                    titulo="Pestañas de Genesis"
                    className="w-full"
                />
            </div>

            <div className="hidden sm:flex flex-col gap-2 rounded-xl border border-white/10 bg-[#0A0F1D]/85 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <nav aria-label="Familias de secciones" className="flex flex-wrap items-center gap-1">
                        {grupos.map((g) => {
                            const cuenta = pestanas.filter((p) => p.grupo === g).length;
                            const activo = !busqueda.trim() && grupoEfectivo === g;
                            return (
                                <button
                                    key={g}
                                    type="button"
                                    onClick={() => seleccionarGrupo(g)}
                                    aria-pressed={activo}
                                    className={`cursor-pointer inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                        activo
                                            ? "border-sky-400/60 bg-sky-500/20 text-sky-100"
                                            : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25 hover:text-white"
                                    }`}
                                >
                                    <span>{g}</span>
                                    <span className="text-[10px] text-white/45">{cuenta}</span>
                                </button>
                            );
                        })}
                    </nav>

                    <div className="flex items-center gap-2">
                        <div className="relative flex items-center">
                            <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-slate-400" aria-hidden />
                            <input
                                type="search"
                                value={busqueda}
                                onChange={(e) => setBusqueda(e.target.value)}
                                placeholder="Buscar sección…"
                                aria-label="Buscar sección en MetaGenesis"
                                className="w-44 rounded-lg border border-white/15 bg-black/40 py-1 pl-7 pr-6 text-[11px] text-slate-100 placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                            />
                            {busqueda ? (
                                <button
                                    type="button"
                                    aria-label="Limpiar búsqueda"
                                    onClick={() => setBusqueda("")}
                                    className="absolute right-1.5 cursor-pointer text-slate-400 hover:text-white"
                                >
                                    <X className="h-3 w-3" aria-hidden />
                                </button>
                            ) : null}
                        </div>

                        <button
                            type="button"
                            onClick={alAlternarPliegue}
                            aria-pressed={todoPlegado}
                            data-testid="boton-plegar-todo"
                            className="mc-alzar cursor-pointer rounded-lg border border-sky-400/40 bg-sky-500/10 px-3 py-1 text-[11px] font-medium text-sky-100"
                        >
                            {etiquetaPliegue}
                        </button>
                    </div>
                </div>

                <Tabs value={pestanaActiva} onValueChange={alCambiarPestana}>
                    <TabsList
                        aria-label="Pestañas de Genesis"
                        className="h-auto w-full flex-nowrap justify-start gap-1.5 overflow-x-auto rounded-lg border border-white/10 bg-black/30 p-1.5 scrollbar-thin"
                    >
                        {visibles.length === 0 ? null : (
                            visibles.map((p) => (
                                <TabsTrigger
                                    key={p.id}
                                    value={p.id}
                                    className="mc-alzar flex-none cursor-pointer rounded-md px-3 py-1.5 text-xs data-[state=active]:border data-[state=active]:border-sky-400/50 data-[state=active]:bg-sky-500/20 data-[state=active]:text-sky-50"
                                >
                                    {p.etiqueta}
                                    {renderInsignia ? renderInsignia(p.id) : null}
                                </TabsTrigger>
                            ))
                        )}
                    </TabsList>
                    {visibles.length === 0 && (
                        <div className="px-2 py-1 text-[11px] text-slate-400" role="status">
                            Sin secciones para «{busqueda}».
                        </div>
                    )}
                </Tabs>
            </div>

            <div className="flex items-center justify-center sm:hidden py-1">
                <button
                    type="button"
                    onClick={alAlternarPliegue}
                    aria-pressed={todoPlegado}
                    className="mc-alzar cursor-pointer rounded-md border border-cyan-300/40 bg-cyan-400/10 px-3 py-1.5 text-[11px] text-cyan-100"
                >
                    {etiquetaPliegue}
                </button>
            </div>
        </div>
    );
}
