/**
 * Catálogo de widgets del editor superior.
 *
 * Une las tres fuentes que ya existían y que antes enseñaban catálogos distintos:
 *   · las fichas del selector clásico (`AVAILABLE_WIDGETS`: título, descripción e icono),
 *   · el mapa de categorías y etiquetas (`WIDGET_CATEGORY_MAP`),
 *   · el manifiesto (`WIDGET_MANIFEST`: nombre, categoría y relevancia de TODOS los widgets).
 * Así el editor ofrece el catálogo completo (antes el selector solo enseñaba ~55 de ~100).
 */
import type * as React from "react";
import type { WidgetType } from "../dashboard-types";
import { AVAILABLE_WIDGETS } from "../add-widget-dialog";
import { WIDGET_CATEGORY_MAP } from "../dashboard-defaults";
import { WIDGET_MANIFEST } from "../widget-manifest";
import { WIDGET_CATEGORIES, type WidgetCategory, type WidgetCategoryDef } from "../widget-categories";
import { getWidgetFunctionStyle } from "../widget-function-style";

export interface EntradaCatalogo {
    type: WidgetType;
    titulo: string;
    descripcion: string;
    /** Icono de la ficha clásica, si existe (si no, se usa el de su categoría). */
    icono: React.ReactNode | null;
    categoria: WidgetCategory;
    secundarias: WidgetCategory[];
    etiquetas: string[];
    popular: boolean;
    relevancia: number;
    acento: string;
    peso: "ambient" | "data" | "action";
}

/** Widgets que no se añaden desde el catálogo: el de IA se forja; el de clima espacial es heredado. */
const EXCLUIDOS = new Set<WidgetType>(["AI_GENERATED", "WEATHER_SPACE"]);

const IDS_CATEGORIA = new Set<string>(WIDGET_CATEGORIES.map((c) => c.id));
const ALIAS_CATEGORIA: Record<string, WidgetCategory> = { ontocracia: "politica", comunicacion: "social" };

function categoriaValida(id: string | undefined): WidgetCategory {
    if (!id) return "utilidades";
    if (IDS_CATEGORIA.has(id)) return id as WidgetCategory;
    return ALIAS_CATEGORIA[id] ?? "utilidades";
}

function capitalizar(s: string): string {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function construirCatalogo(): EntradaCatalogo[] {
    const fichas = new Map(AVAILABLE_WIDGETS.map((w) => [w.type, w]));
    const mapa = new Map(WIDGET_CATEGORY_MAP.map((m) => [m.type, m]));
    const tipos = new Set<WidgetType>([
        ...AVAILABLE_WIDGETS.map((w) => w.type),
        ...WIDGET_CATEGORY_MAP.map((m) => m.type),
        ...(Object.keys(WIDGET_MANIFEST) as WidgetType[]),
    ]);
    const salida: EntradaCatalogo[] = [];
    for (const type of tipos) {
        if (EXCLUIDOS.has(type)) continue;
        const ficha = fichas.get(type);
        const m = mapa.get(type);
        const man = WIDGET_MANIFEST[type];
        const etiquetas = Array.from(new Set([...(ficha?.tags ?? []), ...(m?.tags ?? [])]));
        const estilo = getWidgetFunctionStyle(type);
        salida.push({
            type,
            titulo: ficha?.title ?? man?.label ?? capitalizar(type.toLowerCase().replace(/_/g, " ")),
            descripcion: ficha?.description ?? (etiquetas.length ? `${capitalizar(etiquetas.slice(0, 5).join(" · "))}.` : "Widget del sistema."),
            icono: ficha?.icon ?? null,
            categoria: categoriaValida(ficha?.primaryCategory ?? m?.primaryCategory ?? man?.category),
            secundarias: (ficha?.secondaryCategories ?? m?.secondaryCategories ?? []).map((c) => categoriaValida(c)),
            etiquetas,
            popular: Boolean(ficha?.isPopular ?? m?.isPopular),
            relevancia: man?.relevance ?? 50,
            acento: estilo.accent,
            peso: estilo.weight,
        });
    }
    return salida;
}

let cache: EntradaCatalogo[] | null = null;
/** El catálogo completo (se construye una vez). */
export function catalogoCompleto(): EntradaCatalogo[] {
    if (!cache) cache = construirCatalogo();
    return cache;
}

/** Minúsculas y sin tildes: «energia» encuentra «Energía». */
export function normalizar(s: string): string {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

export type FiltroCategoria = "todos" | "populares" | "recomendados" | WidgetCategory;

export function perteneceA(e: EntradaCatalogo, categoria: WidgetCategory): boolean {
    return e.categoria === categoria || e.secundarias.includes(categoria);
}

export function filtrarCatalogo(entradas: readonly EntradaCatalogo[], filtro: { texto?: string; categoria?: FiltroCategoria }): EntradaCatalogo[] {
    const cat = filtro.categoria ?? "todos";
    let res = [...entradas];
    if (cat === "populares") res = res.filter((e) => e.popular);
    else if (cat === "recomendados") res = res.sort((a, b) => b.relevancia - a.relevancia).slice(0, 12);
    else if (cat !== "todos") res = res.filter((e) => perteneceA(e, cat));

    const q = normalizar(filtro.texto ?? "");
    if (q) {
        const palabras = q.split(/\s+/).filter(Boolean);
        res = res.filter((e) => {
            const pajar = normalizar([e.titulo, e.descripcion, e.categoria, ...e.etiquetas].join(" "));
            return palabras.every((p) => pajar.includes(p));
        });
    }
    return res;
}

/** Categorías que tienen al menos un widget, con su recuento (en el orden del registro). */
export function categoriasConWidgets(entradas: readonly EntradaCatalogo[]): { cat: WidgetCategoryDef; n: number }[] {
    return WIDGET_CATEGORIES
        .map((cat) => ({ cat, n: entradas.filter((e) => perteneceA(e, cat.id)).length }))
        .filter((x) => x.n > 0);
}
