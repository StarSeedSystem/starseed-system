"use client";

/**
 * IDI1115N · Selector de idioma de StarSeed OS (ventana de acceso y Ajustes › Neuronas).
 * Un botón con globo cuyo rótulo recorre «Elegir idioma» en 36 idiomas, cada segundo, cada uno en su
 * escritura (decoración: los lectores de pantalla oyen un solo nombre estable). Se abre en línea
 * (sin portal, para convivir con la ventana modal): sugerido para este aparato primero, el resto
 * por su propio nombre, y una caja de búsqueda. Teclado: Enter/Espacio abre, ↓ baja a la lista,
 * ↑↓ recorren, Enter elige, Esc cierra (sin cerrar la ventana de acceso). Usable a 360 px.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Globe } from "lucide-react";
import { idiomasConCatalogo, IDIOMAS, porCodigo, type Idioma } from "@/lib/idiomas/idiomas";
import { listaMundial } from "@/lib/idiomas/lista-mundial";
import { buscarIdiomas } from "@/lib/idiomas/busqueda";
import { EVENTO_IDIOMA, elegirIdioma, idiomaEfectivo, sugerirIdioma } from "@/lib/idiomas/estado";
import { estadoCatalogo } from "@/lib/idiomas/catalogos/cargar";

const conCatalogoMemo = typeof window !== "undefined" ? idiomasConCatalogo() : [];

export function estadoDe(codigo: string): "revisado" | "automatico" | "ninguno" {
    if (!conCatalogoMemo.includes(codigo)) return codigo === "es" ? "revisado" : "ninguno";
    return estadoCatalogo(codigo);
}

function Etiqueta({ codigo }: { codigo: string }) {
    const e = estadoDe(codigo);
    if (codigo === "es") return <span className="text-[11px] text-muted-foreground">Idioma original</span>;
    if (e === "revisado") return <span className="text-[11px] text-emerald-300">Catálogo revisado</span>;
    if (e === "automatico") return <span className="text-[11px] text-amber-300">Traducción automática, sin revisar</span>;
    return <span className="text-[11px] text-muted-foreground">Aún sin catálogo: se verá en español</span>;
}

/** Texto del botón: rota «Elegir idioma» en todos los idiomas; no lo lee ningún lector de pantalla. */
export function RotuloGiratorio({ cada = 1000 }: { cada?: number }) {
    const [i, setI] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setI((x) => (x + 1) % IDIOMAS.length), cada);
        return () => clearInterval(t);
    }, [cada]);
    const idioma = IDIOMAS[i];
    return (
        <span aria-hidden="true" translate="no" data-no-traducir="" data-testid="rotulo-idioma" lang={idioma.codigo} dir={idioma.dir} className="min-w-0 truncate font-medium">
            {idioma.rotulo}
        </span>
    );
}

export interface SelectorIdiomaProps { className?: string; alElegir?: (codigo: string) => void; abiertoAlInicio?: boolean }

export function SelectorIdioma({ className = "", alElegir, abiertoAlInicio = false }: SelectorIdiomaProps) {
    const id = useId();
    const [abierto, setAbierto] = useState(abiertoAlInicio);
    const [filtro, setFiltro] = useState("");
    const [actual, setActual] = useState("es");
    const [aviso, setAviso] = useState("");
    const sugerido = useMemo(() => sugerirIdioma(), []);
    const boton = useRef<HTMLButtonElement>(null);
    const caja = useRef<HTMLInputElement>(null);
    const lista = useRef<HTMLUListElement>(null);

    useEffect(() => {
        const leer = (): void => setActual(idiomaEfectivo().codigo);
        leer();
        window.addEventListener(EVENTO_IDIOMA, leer);
        return () => window.removeEventListener(EVENTO_IDIOMA, leer);
    }, []);
    useEffect(() => { if (abierto) caja.current?.focus(); }, [abierto]);

    const codigosElegibles = IDIOMAS.map((i) => i.codigo);
    const listaCompleta = useMemo(() => listaMundial({ idiomaActual: actual }).filter((i) => codigosElegibles.includes(i.codigo)), [actual]);

    const visibles = useMemo(() => {
        const primero = listaCompleta.find((i) => i.codigo === sugerido && i.codigo !== "es");
        const resto = listaCompleta.filter((i) => i !== primero);
        return {
            sugerido: primero && buscarIdiomas([primero], filtro).length > 0 ? primero : null,
            resto: buscarIdiomas(resto, filtro),
        };
    }, [filtro, sugerido, listaCompleta]);

    const elegir = (i: Idioma): void => {
        if (!elegirIdioma(i.codigo)) { setAviso("error"); return; }
        setActual(i.codigo);
        setAviso(estadoDe(i.codigo) === "ninguno" ? i.codigo : "");
        alElegir?.(i.codigo);
        setAbierto(false);
        boton.current?.focus();
    };
    const mover = (desde: number, paso: number): void => {
        const items = Array.from(lista.current?.querySelectorAll<HTMLElement>("[role=option]") ?? []);
        const siguiente = items[desde + paso];
        if (siguiente) siguiente.focus(); else if (paso < 0) caja.current?.focus();
    };
    const alTeclear = (e: React.KeyboardEvent): void => {
        if (e.key === "Escape" && abierto) { e.stopPropagation(); e.preventDefault(); setAbierto(false); boton.current?.focus(); }
    };

    const idiomaActual = porCodigo(actual);
    const fila = (i: { codigo: string; nombreActual: string; dir: "ltr" | "rtl" }, n: number, destacado = false) => (
        <li
            key={`${destacado ? "s" : "o"}-${i.codigo}`}
            role="option"
            aria-selected={i.codigo === actual}
            tabIndex={-1}
            data-codigo={i.codigo}
            onClick={() => elegir(porCodigo(i.codigo)!)}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); elegir(porCodigo(i.codigo)!); }
                else if (e.key === "ArrowDown") { e.preventDefault(); mover(n, 1); }
                else if (e.key === "ArrowUp") { e.preventDefault(); mover(n, -1); }
            }}
            className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-1.5 outline-none hover:bg-white/10 focus-visible:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
            <span className="flex min-w-0 flex-col">
                <span translate="no" data-no-traducir="" lang={i.codigo} dir={i.dir} className="truncate text-sm font-medium">{i.nombreActual}</span>
                <Etiqueta codigo={i.codigo} />
            </span>
            {i.codigo === actual && <Check className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden />}
        </li>
    );

    return (
        <div className={`w-full ${className}`} data-testid="selector-idioma" onKeyDown={alTeclear}>
            <button
                ref={boton}
                type="button"
                aria-label="Elegir idioma"
                aria-haspopup="listbox"
                aria-expanded={abierto}
                aria-controls={`${id}-panel`}
                onClick={() => setAbierto((a) => !a)}
                className="flex min-h-[44px] w-full py-3 cursor-pointer items-center gap-2.5 rounded-xl border border-cyan-300/40 bg-cyan-300/10 px-3.5 text-left text-sm text-white outline-none transition-colors hover:bg-cyan-300/20 focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
                <Globe className="h-5 w-5 shrink-0 text-cyan-200" aria-hidden />
                <RotuloGiratorio />
                <span aria-hidden="true" translate="no" data-no-traducir="" className="ml-auto shrink-0 rounded-md bg-white/10 px-2 py-0.5 text-xs">{idiomaActual?.nombre ?? "Español"}</span>
            </button>
            {abierto && (
                <div id={`${id}-panel`} data-testid="panel-idioma" className="mt-2 rounded-xl border border-white/15 bg-black/40 p-2">
                    <input
                        ref={caja}
                        type="search"
                        value={filtro}
                        onChange={(e) => setFiltro(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); lista.current?.querySelector<HTMLElement>("[role=option]")?.focus(); } }}
                        placeholder="Buscar idioma"
                        aria-label="Buscar idioma"
                        autoComplete="off"
                        className="mb-2 min-h-[44px] w-full rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-white/50 focus-visible:ring-2 focus-visible:ring-cyan-300"
                    />
                    <ul ref={lista} role="listbox" aria-label="Idiomas" className="max-h-64 overflow-y-auto">
                        {visibles.sugerido && (
                            <>
                                <li role="presentation" className="px-3 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-cyan-200">Sugerido para este aparato</li>
                                {fila(visibles.sugerido, 0, true)}
                                <li role="presentation" className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-white/60">Todos los idiomas</li>
                            </>
                        )}
                        {visibles.resto.map((i, n) => fila(i, n + (visibles.sugerido ? 1 : 0)))}
                        {!visibles.sugerido && visibles.resto.length === 0 && <li role="presentation" className="px-3 py-3 text-sm text-white/60">Ningún idioma coincide.</li>}
                    </ul>
                </div>
            )}
            <p className="mt-1.5 px-1 text-[11px] text-white/60" aria-live="polite" data-testid="estado-idioma">
                {aviso === "error" ? "No se pudo guardar el idioma en este aparato." : aviso ? <>Aún no hay catálogo de <span translate="no" data-no-traducir="">{porCodigo(aviso)?.nombre}</span>: el sistema se ve en español.</> : (idiomaActual ? <><span translate="no" data-no-traducir="" lang={idiomaActual.codigo}>{listaCompleta.find(i => i.codigo === actual)?.nombreActual ?? idiomaActual.nombre}</span> · <Etiqueta codigo={actual} /></> : null)}
            </p>
        </div>
    );
}
