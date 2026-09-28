"use client";
/**
 * Panel «Widgets» del editor superior: el catálogo completo con búsqueda (sin tildes), filtros por
 * categoría que se envuelven, sugerencias para la pestaña, tamaño al añadir (micro · S · M · L ·
 * XL · panorámico · torre) con su vista previa, y dos formas de añadir: tocar la ficha (va al mejor
 * hueco libre) o, con ratón, arrastrarla a la rejilla.
 */
import * as React from "react";
import { ChevronDown, ChevronRight, Flame, Hammer, LayoutGrid, Plus, Search, Sparkles, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardWidget, WidgetType } from "../dashboard-types";
import { getCategoryById, type WidgetCategory } from "../widget-categories";
import { DashboardAiSuggestions } from "../dashboard-ai-suggestions";
import { sugerenciasPara } from "../sugerencias-pestana";
import { catalogoCompleto, categoriasConWidgets, filtrarCatalogo, type EntradaCatalogo, type FiltroCategoria } from "./catalogo";
import { dimsTalla, NOMBRE_CLASE, TALLAS_EDITOR } from "./tallas";
import { iniciarArrastreCatalogo, terminarArrastreCatalogo } from "./arrastre-catalogo";
import type { TallaEditor } from "./tipos";
import { Seccion, pildoraFantasma } from "./ui-editor";

const VIOLETA = "#7C5CFF";
const CATEGORIAS_VISIBLES = 9;

type Filtro = FiltroCategoria | "pestana";

export interface PanelWidgetsProps {
    widgets: DashboardWidget[];
    nombrePestana: string;
    talla: TallaEditor;
    onTalla: (t: TallaEditor) => void;
    onAnadir: (type: WidgetType, talla: TallaEditor) => void;
    onForjar: () => void;
    onCrearDesdePlantilla: (categoryId: string, nombre: string) => void;
    /** Con ratón: las fichas se pueden arrastrar a la rejilla. */
    arrastrable: boolean;
}

/** Glifo de la proporción de una talla (para los botones de tamaño). */
function GlifoTalla({ talla }: { talla: TallaEditor }) {
    const d = dimsTalla("CLOCK_DATE", talla);
    const r = (d.w * 95) / (d.h * 65);
    const ancho = r >= 1 ? 16 : Math.max(5, Math.round(16 * r));
    const alto = r >= 1 ? Math.max(5, Math.round(16 / r)) : 16;
    return <span aria-hidden className="inline-block rounded-[3px] bg-current opacity-80" style={{ width: ancho, height: alto }} />;
}

/** Silueta viva de un widget con la proporción de la talla elegida (no monta el widget real). */
function VistaPrevia({ entrada, talla }: { entrada: EntradaCatalogo; talla: TallaEditor }) {
    const d = dimsTalla(entrada.type, talla);
    const r = (d.w * 95) / (d.h * 65);
    const ancho = r >= 2.6;
    const semilla = entrada.type.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
    const a = entrada.acento;
    return (
        <div className="relative grid h-16 place-items-center overflow-hidden rounded-xl" style={{ background: `linear-gradient(135deg, ${a}14, transparent 70%)`, boxShadow: `inset 0 0 0 1px ${a}26` }}>
            <div
                className="relative overflow-hidden rounded-lg"
                style={{
                    aspectRatio: `${d.w * 95} / ${d.h * 65}`,
                    width: ancho ? "92%" : "auto",
                    height: ancho ? "auto" : 52,
                    maxWidth: "92%",
                    background: `linear-gradient(160deg, ${a}33, rgba(12,14,34,.6))`,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,.12), inset 0 0 0 1px ${a}55`,
                }}
            >
                {entrada.peso === "data" && (
                    <div className="absolute inset-x-1.5 bottom-1 flex h-3/5 items-end gap-[2px]">
                        {Array.from({ length: 6 }, (_, i) => (
                            <span key={i} className="flex-1 rounded-sm" style={{ height: `${30 + ((semilla * (i + 3)) % 65)}%`, background: `${a}${i % 2 ? "88" : "cc"}` }} />
                        ))}
                    </div>
                )}
                {entrada.peso === "action" && (
                    <div className="absolute inset-1.5 grid grid-cols-3 content-end gap-[3px]">
                        {Array.from({ length: 3 }, (_, i) => <span key={i} className="h-2 rounded-sm" style={{ background: `${a}${i === 0 ? "aa" : "44"}` }} />)}
                    </div>
                )}
                {entrada.peso === "ambient" && <span className="absolute -bottom-3 -right-3 size-10 rounded-full blur-md" style={{ background: `${a}66` }} />}
            </div>
            <span className="absolute left-1.5 top-1 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-white/45">{NOMBRE_CLASE[d.clase]}</span>
        </div>
    );
}

function FichaWidget({ entrada, talla, motivo, presentes, arrastrable, onAnadir }: {
    entrada: EntradaCatalogo; talla: TallaEditor; motivo?: string; presentes: number; arrastrable: boolean; onAnadir: () => void;
}) {
    const cat = getCategoryById(entrada.categoria);
    const IconoCat = cat?.icon ?? LayoutGrid;
    const etiquetaTalla = TALLAS_EDITOR.find((t) => t.id === talla)?.etiqueta ?? talla;
    return (
        <button
            type="button"
            draggable={arrastrable}
            onDragStart={(e) => {
                const d = dimsTalla(entrada.type, talla);
                iniciarArrastreCatalogo(e.dataTransfer, { type: entrada.type, talla, w: d.w, h: d.h });
            }}
            onDragEnd={() => terminarArrastreCatalogo()}
            onClick={onAnadir}
            aria-label={`Añadir ${entrada.titulo} (${etiquetaTalla})`}
            data-widget-tipo={entrada.type}
            className="group relative flex h-full flex-col gap-2 rounded-2xl p-2.5 text-left cursor-pointer transition-[background,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:hover:translate-y-0"
            style={{ background: "rgba(255,255,255,.03)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.07)", outlineColor: entrada.acento }}
        >
            <VistaPrevia entrada={entrada} talla={talla} />
            <div className="flex items-start gap-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-xl [&_svg]:size-4" style={pildoraFantasma(entrada.acento)}>
                    {entrada.icono ?? <IconoCat className="size-4" style={{ color: entrada.acento }} />}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 text-[13.5px] font-semibold leading-tight text-white/90">
                        {entrada.titulo}
                        {entrada.popular && <Star className="size-3 shrink-0 fill-yellow-400 text-yellow-400" aria-label="Popular" />}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[12px] leading-snug text-white/55">{motivo ?? entrada.descripcion}</span>
                </span>
            </div>
            <span className="mt-auto flex flex-wrap items-center justify-between gap-1 text-[11px] text-white/45">
                <span>{cat?.name ?? entrada.categoria}{presentes > 0 ? ` · ya tienes ${presentes}` : ""}</span>
                <span className="inline-flex items-center gap-0.5 font-semibold transition-colors duration-200 group-hover:text-white" style={{ color: entrada.acento }}>
                    <Plus className="size-3.5" aria-hidden /> Añadir
                </span>
            </span>
        </button>
    );
}

function ChipFiltro({ activo, onClick, children, n }: { activo: boolean; onClick: () => void; children: React.ReactNode; n?: number }) {
    return (
        <button
            type="button"
            aria-pressed={activo}
            onClick={onClick}
            className={cn(
                "ss-redondo inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold cursor-pointer transition-[background,box-shadow,color] duration-200",
                activo ? "text-white" : "text-white/60 hover:bg-white/[0.06] hover:text-white",
            )}
            style={activo ? pildoraFantasma(VIOLETA) : { boxShadow: "inset 0 0 0 1px rgba(255,255,255,.07)" }}
        >
            {children}
            {typeof n === "number" && <span className="tabular-nums text-[10.5px] text-white/40">{n}</span>}
        </button>
    );
}

export function PanelWidgets({ widgets, nombrePestana, talla, onTalla, onAnadir, onForjar, onCrearDesdePlantilla, arrastrable }: PanelWidgetsProps) {
    const catalogo = React.useMemo(() => catalogoCompleto(), []);
    const [texto, setTexto] = React.useState("");
    const [filtro, setFiltro] = React.useState<Filtro>("pestana");
    const [todasCategorias, setTodasCategorias] = React.useState(false);

    const presentes = React.useMemo(() => {
        const m = new Map<WidgetType, number>();
        for (const w of widgets) m.set(w.widget_type, (m.get(w.widget_type) ?? 0) + 1);
        return m;
    }, [widgets]);

    const sugerencias = React.useMemo(() => sugerenciasPara({
        titulo: nombrePestana,
        widgetsPresentes: widgets.map((w) => w.widget_type),
        categoriasPresentes: [],
    }, 8), [nombrePestana, widgets]);
    const motivos = React.useMemo(() => new Map(sugerencias.map((s) => [s.tipo, s.motivo])), [sugerencias]);

    const categorias = React.useMemo(() => categoriasConWidgets(catalogo), [catalogo]);

    const resultados = React.useMemo(() => {
        if (filtro === "pestana" && !texto.trim()) {
            const porTipo = new Map(catalogo.map((e) => [e.type, e]));
            const lista = sugerencias.map((s) => porTipo.get(s.tipo)).filter((e): e is EntradaCatalogo => Boolean(e));
            // Si la pestaña ya lo tiene todo cubierto, se enseñan los más relevantes.
            return lista.length ? lista : filtrarCatalogo(catalogo, { categoria: "recomendados" });
        }
        return filtrarCatalogo(catalogo, { texto, categoria: filtro === "pestana" ? "todos" : filtro });
    }, [catalogo, filtro, texto, sugerencias]);

    const visibles = todasCategorias ? categorias : categorias.slice(0, CATEGORIAS_VISIBLES);
    const ocultas = categorias.length - visibles.length;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <label className="relative min-w-[min(100%,220px)] flex-1">
                    <span className="sr-only">Buscar widgets</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40" aria-hidden />
                    <input
                        type="search"
                        value={texto}
                        onChange={(e) => setTexto(e.target.value)}
                        placeholder="Buscar por nombre, tema o etiqueta…"
                        className="h-10 w-full rounded-xl bg-black/30 pl-9 pr-9 text-[14px] text-white placeholder:text-white/35 outline-none ring-1 ring-white/10 transition-shadow duration-200 focus:ring-2 focus:ring-[#7C5CFF]/60"
                    />
                    {texto && (
                        <button type="button" onClick={() => setTexto("")} aria-label="Borrar la búsqueda" className="ss-redondo absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-white/50 hover:bg-white/10 hover:text-white">
                            <X className="size-3.5" />
                        </button>
                    )}
                </label>
                <DashboardAiSuggestions
                    widgets={widgets}
                    dashboardName={nombrePestana}
                    onAddWidget={(type) => onAnadir(type, talla)}
                    onCreateFromTemplate={(categoryId, nombre) => onCrearDesdePlantilla(categoryId, nombre)}
                    variant="button"
                />
            </div>

            <Seccion titulo="Tamaño al añadir" ayuda="Cada tamaño es un diseño distinto del widget, no una simple escala.">
                <div role="radiogroup" aria-label="Tamaño al añadir" className="flex flex-wrap gap-1.5">
                    {TALLAS_EDITOR.map((t) => {
                        const activo = t.id === talla;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                role="radio"
                                aria-checked={activo}
                                title={t.ayuda}
                                onClick={() => onTalla(t.id)}
                                className={cn(
                                    "ss-redondo inline-flex min-h-9 items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] font-semibold cursor-pointer transition-[background,box-shadow,color] duration-200",
                                    activo ? "text-white" : "text-white/60 hover:bg-white/[0.06] hover:text-white",
                                )}
                                style={activo ? pildoraFantasma(VIOLETA) : { boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)" }}
                            >
                                <GlifoTalla talla={t.id} />
                                {t.etiqueta}
                            </button>
                        );
                    })}
                </div>
            </Seccion>

            <Seccion titulo="Categorías">
                <div className="flex flex-wrap gap-1.5">
                    <ChipFiltro activo={filtro === "pestana"} onClick={() => setFiltro("pestana")} n={sugerencias.length}>
                        <Sparkles className="size-3.5 text-[#7C5CFF]" aria-hidden /> Para esta pestaña
                    </ChipFiltro>
                    <ChipFiltro activo={filtro === "todos"} onClick={() => setFiltro("todos")} n={catalogo.length}>Todos</ChipFiltro>
                    <ChipFiltro activo={filtro === "populares"} onClick={() => setFiltro("populares")} n={catalogo.filter((e) => e.popular).length}>
                        <Star className="size-3.5 text-yellow-400" aria-hidden /> Populares
                    </ChipFiltro>
                    <ChipFiltro activo={filtro === "recomendados"} onClick={() => setFiltro("recomendados")}>
                        <Flame className="size-3.5 text-orange-400" aria-hidden /> Recomendados
                    </ChipFiltro>
                    {visibles.map(({ cat, n }) => {
                        const Icono = cat.icon;
                        return (
                            <ChipFiltro key={cat.id} activo={filtro === cat.id} onClick={() => setFiltro(cat.id as WidgetCategory)} n={n}>
                                <Icono className="size-3.5" aria-hidden /> {cat.name}
                            </ChipFiltro>
                        );
                    })}
                    {categorias.length > CATEGORIAS_VISIBLES && (
                        <button
                            type="button"
                            onClick={() => setTodasCategorias((v) => !v)}
                            aria-expanded={todasCategorias}
                            className="ss-redondo inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold text-white/55 cursor-pointer hover:bg-white/[0.06] hover:text-white"
                        >
                            {todasCategorias ? "Menos categorías" : `Más categorías (${ocultas})`}
                            <ChevronDown className={cn("size-3.5 transition-transform duration-200", todasCategorias && "rotate-180")} aria-hidden />
                        </button>
                    )}
                </div>
            </Seccion>

            <div className="space-y-2">
                <p className="text-[12px] text-white/50" aria-live="polite">
                    {resultados.length === 0
                        ? "Nada coincide con esa búsqueda."
                        : `${resultados.length} widget${resultados.length === 1 ? "" : "s"}${arrastrable ? " · toca para añadir o arrastra al tablero" : " · toca para añadir en el mejor hueco"}`}
                </p>
                <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(176px,1fr))]">
                    <button
                        type="button"
                        onClick={onForjar}
                        className="group relative flex h-full min-h-[150px] flex-col justify-between gap-2 overflow-hidden rounded-2xl p-3 text-left cursor-pointer transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
                        style={{ background: "linear-gradient(135deg, rgba(99,102,241,.22), rgba(236,72,153,.14) 60%, rgba(12,14,34,.4))", boxShadow: "inset 0 0 0 1px rgba(165,180,252,.35)" }}
                    >
                        <span className="grid size-10 place-items-center rounded-2xl" style={pildoraFantasma("#818CF8")}>
                            <Hammer className="size-5 text-indigo-200" aria-hidden />
                        </span>
                        <span>
                            <span className="flex items-center gap-1 text-[14px] font-semibold text-white">Crear con IA <ChevronRight className="size-4 text-indigo-300" aria-hidden /></span>
                            <span className="mt-0.5 block text-[12px] leading-snug text-white/60">La Fragua de Interfaces: describe el widget y se forja para ti.</span>
                        </span>
                    </button>
                    {resultados.map((e) => (
                        <FichaWidget
                            key={e.type}
                            entrada={e}
                            talla={talla}
                            motivo={filtro === "pestana" && !texto.trim() ? motivos.get(e.type) : undefined}
                            presentes={presentes.get(e.type) ?? 0}
                            arrastrable={arrastrable}
                            onAnadir={() => onAnadir(e.type, talla)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
