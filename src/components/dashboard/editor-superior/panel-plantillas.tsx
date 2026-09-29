"use client";
/**
 * Panel «Plantillas» (rediseño 2026-09-29).
 *
 * Arriba, las plantillas PARA ESTA PESTAÑA: la composición de su tema en tres variantes (Completo,
 * Esencial, Enfoque) con su miniatura. Debajo, todos los temas con su icono, su luz y su lema, para
 * aplicarlos aquí (quien aloja el editor confirma: sustituye los widgets, con Deshacer) o abrirlos
 * en una pestaña nueva.
 */
import * as React from "react";
import { LayoutGrid, Monitor, Plus, Replace, Search } from "lucide-react";
import type { DashboardWidget, WidgetType } from "../dashboard-types";
import { ALL_DASHBOARD_TEMPLATES, type DefaultDashboardTemplate } from "../dashboard-defaults";
import { getCategoryById } from "../widget-categories";
import { MiniAcomodo } from "./panel-acomodo";
import { normalizar } from "./catalogo";
import { Seccion, pildoraFantasma } from "./ui-editor";
import { aspectoDe, conAlfa, temaDeCategoria } from "../pestanas/temas";
import { VARIANTES, variantePlantilla } from "../pestanas/variantes";
import type { VariantePlantilla } from "./tipos";

const ESMERALDA = "#10B981";

export interface PanelPlantillasProps {
    nombrePestana: string;
    /** (2026-09-29) Tema de la pestaña que se edita: sus variantes van primero. */
    categoriaPestana?: string;
    onAplicar: (categoryId: string, variante?: VariantePlantilla) => void;
    onCrear: (categoryId: string, nombre: string) => void;
}

function widgetsDePlantilla(t: DefaultDashboardTemplate): DashboardWidget[] {
    return t.widgets.map((w, i) => ({
        id: `${t.categoryId}-${i}`,
        dashboard_id: t.categoryId,
        widget_type: w.type as WidgetType,
        layout: { x: w.x, y: w.y, w: w.w, h: w.h },
        settings: {},
        created_at: "",
    }));
}

export function PanelPlantillas({ nombrePestana, categoriaPestana, onAplicar, onCrear }: PanelPlantillasProps) {
    const [texto, setTexto] = React.useState("");
    const propia = categoriaPestana ? ALL_DASHBOARD_TEMPLATES.find((t) => t.categoryId === categoriaPestana) : undefined;
    const lista = React.useMemo(() => {
        const q = normalizar(texto);
        return ALL_DASHBOARD_TEMPLATES.filter((t) => {
            if (!q) return true;
            const cat = getCategoryById(t.categoryId);
            const tema = temaDeCategoria(t.categoryId);
            return normalizar([t.name, tema.lema, cat?.description ?? "", ...(cat?.tags ?? [])].join(" ")).includes(q);
        });
    }, [texto]);

    return (
        <div className="space-y-5">
            {propia && (() => {
                const a = aspectoDe({ category: propia.categoryId });
                return (
                    <Seccion titulo={`Para esta pestaña · ${propia.name}`} ayuda={`${a.tema.lema}. Elige cuánto quieres ver: se aplica aquí y puedes deshacerlo.`}>
                        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
                            {VARIANTES.map((v) => {
                                const t = variantePlantilla(propia, v.id);
                                const n = t.widgets.length;
                                return (
                                    <article
                                        key={v.id}
                                        className="flex flex-col gap-2.5 rounded-2xl p-3"
                                        style={{ background: `linear-gradient(160deg, ${conAlfa(a.acento, 0.12)}, rgba(255,255,255,.02))`, boxShadow: `inset 0 0 0 1px ${conAlfa(a.acento, 0.28)}` }}
                                    >
                                        <header className="min-w-0">
                                            <span className="block text-[14px] font-semibold text-white/90">{v.etiqueta}</span>
                                            <span className="block text-[12px] text-white/55">{v.ayuda} · {n} widget{n === 1 ? "" : "s"}</span>
                                        </header>
                                        <MiniAcomodo widgets={widgetsDePlantilla(t)} punto="lg" nombre="Escritorio" icono={Monitor} />
                                        <button
                                            type="button"
                                            onClick={() => onAplicar(propia.categoryId, v.id)}
                                            className="ss-redondo mt-auto inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-white cursor-pointer transition-transform duration-200 hover:scale-[1.02] motion-reduce:hover:scale-100"
                                            style={pildoraFantasma(a.acento)}
                                            aria-label={`Aplicar ${propia.name} ${v.etiqueta} a ${nombrePestana}`}
                                        >
                                            <Replace className="size-3.5" aria-hidden /> Aplicar aquí
                                        </button>
                                    </article>
                                );
                            })}
                        </div>
                    </Seccion>
                );
            })()}

            <Seccion titulo="Todos los temas">
                <label className="relative block max-w-md">
                    <span className="sr-only">Buscar plantillas</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40" aria-hidden />
                    <input
                        type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar plantillas…"
                        className="h-10 w-full rounded-xl bg-black/30 pl-9 pr-3 text-[14px] text-white placeholder:text-white/35 outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-[#10B981]/60"
                    />
                </label>
                {lista.length === 0 && <p className="text-[12.5px] text-white/50">Ninguna plantilla coincide.</p>}
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
                    {lista.map((t) => {
                        const a = aspectoDe({ category: t.categoryId });
                        const Icono = a.icono ?? LayoutGrid;
                        const vacia = t.widgets.length === 0;
                        return (
                            <article key={t.categoryId} className="flex flex-col gap-2.5 rounded-2xl p-3" style={{ background: "rgba(255,255,255,.03)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.07)" }}>
                                <header className="flex items-start gap-2.5">
                                    <span className="grid size-9 shrink-0 place-items-center rounded-xl" style={pildoraFantasma(a.acento)}>
                                        <Icono className="size-[18px]" style={{ color: a.acento }} aria-hidden />
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-[14px] font-semibold text-white/90">{t.name}</span>
                                        <span className="block text-[12px] text-white/50">{t.widgets.length} widget{t.widgets.length === 1 ? "" : "s"} · {a.tema.lema}</span>
                                    </span>
                                </header>
                                {!vacia && <MiniAcomodo widgets={widgetsDePlantilla(t)} punto="lg" nombre="Escritorio" icono={Monitor} />}
                                <div className="mt-auto flex flex-wrap gap-1.5">
                                    <button
                                        type="button" disabled={vacia} onClick={() => onAplicar(t.categoryId)}
                                        className="ss-redondo inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                                        style={pildoraFantasma("#FFBF00")}
                                        aria-label={`Aplicar la plantilla ${t.name} a ${nombrePestana}`}
                                    >
                                        <Replace className="size-3.5" aria-hidden /> Aplicar aquí
                                    </button>
                                    <button
                                        type="button" onClick={() => onCrear(t.categoryId, t.name)}
                                        className="ss-redondo inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold text-white cursor-pointer"
                                        style={pildoraFantasma(ESMERALDA)}
                                        aria-label={`Abrir la plantilla ${t.name} en una pestaña nueva`}
                                    >
                                        <Plus className="size-3.5" aria-hidden /> Pestaña nueva
                                    </button>
                                </div>
                            </article>
                        );
                    })}
                </div>
            </Seccion>
        </div>
    );
}
