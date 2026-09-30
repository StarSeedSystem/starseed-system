/**
 * Migración de las pestañas predeterminadas (gen12, 2026-09-29) — PURO.
 *
 * Regla de CLAUDE.md §11 y lección «update-propagation»: una mejora de los predeterminados tiene
 * que LLEGAR a las cuentas que ya existen, y a la vez NO puede destruir lo que la persona hizo.
 * Antes, al subir la versión, `reseedDefaultDashboards` regeneraba de cero TODAS las pestañas
 * temáticas: quien había movido un widget en «Clima» lo perdía. Ahora:
 *
 *  · Cada pestaña sembrada lleva una MARCA (`plantilla`: categoría, generación y huella de sus
 *    widgets tal como se sembraron). Si al migrar sus widgets siguen dando la misma huella, está
 *    INTACTA y se renueva con el diseño nuevo (conservando su id, su nombre, su icono, su color,
 *    sus dispositivos y los ids de los widgets del mismo tipo, que guardan estado propio).
 *  · Las pestañas gen11 no tenían marca: se comparan con la huella de gen11 (legado-gen11.ts).
 *  · Si la persona la tocó (movió, añadió, quitó, configuró), se CONSERVA tal cual y queda
 *    anotado que hay un diseño nuevo disponible: lo aplica ella con un toque (y puede deshacerlo)
 *    o lo descarta.
 *  · Las temáticas que faltan se añaden al final, salvo las que la persona borró a propósito.
 *  · Nunca se borra una pestaña ni un widget de la persona.
 *
 * Sin `window`, sin `localStorage`, sin azar: el id nuevo y la fecha entran por parámetro.
 */
import type { Dashboard, DashboardWidget, WidgetType } from "../dashboard-types";
import type { DefaultDashboardTemplate } from "../dashboard-defaults";
import { LEGADO_GEN11, type PiezaLegado } from "./legado-gen11";

/** Generación actual de las pestañas predeterminadas. Súbela al cambiar las plantillas. */
export const VERSION_PREDETERMINADOS = "gen12-2026-09-29-pestanas-curadas";

export interface MarcaPlantilla {
    /** Categoría de la plantilla de la que salió la pestaña. */
    cat: string;
    /** Generación con la que se sembró o renovó por última vez. */
    v: string;
    /** Huella de sus widgets tal como se sembraron ("" = ya no es la de fábrica). */
    huella: string;
    /** Generación cuyo diseño nuevo la persona prefirió no aplicar (no se vuelve a ofrecer). */
    descartada?: string;
}

/** Un tablero con los campos aditivos de las pestañas (viajan en el mismo JSON sincronizado). */
export type TableroMarcado = Dashboard & {
    plantilla?: MarcaPlantilla;
    icono?: string;
    acento?: string;
    ambiente?: "auto" | "apagado";
    /** (2026-09-30) Creada por la persona (nueva, duplicada o importada): nunca cuenta como la de fábrica. */
    origen?: "persona";
};

export interface Dependencias {
    uuid: () => string;
    ahora: string;
}

// ── Huellas ─────────────────────────────────────────────────────────────────

function estable(v: unknown): string {
    if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
    if (Array.isArray(v)) return `[${v.map(estable).join(",")}]`;
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${estable(o[k])}`).join(",")}}`;
}

/** FNV-1a de 32 bits en hex (dos pasadas con semillas distintas: 64 bits en total). */
function fnv(texto: string, semilla: number): string {
    let h = semilla >>> 0;
    for (let i = 0; i < texto.length; i++) {
        h ^= texto.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
}

type WidgetHuella = Pick<DashboardWidget, "widget_type" | "layout" | "settings">;

/** Huella de un conjunto de widgets: tipo, posición, tamaño y ajustes (el orden no importa). */
export function huellaWidgets(widgets: readonly WidgetHuella[]): string {
    const partes = widgets
        .map((w) => `${w.widget_type}@${w.layout.x},${w.layout.y},${w.layout.w},${w.layout.h}#${estable(w.settings ?? {})}`)
        .sort();
    const texto = partes.join("|");
    return `${partes.length}-${fnv(texto, 0x811c9dc5)}${fnv(texto, 0x01000193)}`;
}

function mismosAjustes(a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined): boolean {
    return estable(a ?? {}) === estable(b ?? {});
}

/** true si los widgets son los de una de las variantes gen11 (las piezas opcionales pueden faltar). */
export function coincideConLegado(widgets: readonly WidgetHuella[], variantes: readonly PiezaLegado[][]): boolean {
    if (widgets.length === 0) return false;
    return variantes.some((piezas) => {
        const usadas = new Set<number>();
        for (const w of widgets) {
            const i = piezas.findIndex((p, k) => !usadas.has(k) && p.t === w.widget_type && p.x === w.layout.x && p.y === w.layout.y
                && p.w === w.layout.w && p.h === w.layout.h && mismosAjustes(p.s, w.settings));
            if (i < 0) return false;
            usadas.add(i);
        }
        return piezas.every((p, k) => p.opcional || usadas.has(k));
    });
}

// ── Siembra ─────────────────────────────────────────────────────────────────

/**
 * Los widgets de una plantilla para un tablero. Si se pasan los widgets que tenía, los del mismo
 * tipo conservan su id (hay widgets que guardan estado por id, p. ej. su fuente de datos).
 */
export function sembrarWidgets(
    t: Pick<DefaultDashboardTemplate, "widgets">,
    dashboardId: string,
    deps: Dependencias,
    anteriores: readonly DashboardWidget[] = [],
): DashboardWidget[] {
    const libres = [...anteriores];
    return t.widgets.map((w) => {
        const k = libres.findIndex((a) => a.widget_type === w.type);
        const previo = k >= 0 ? libres.splice(k, 1)[0] : undefined;
        const id = previo?.id ?? deps.uuid();
        const i = previo?.layout.i ?? deps.uuid();
        const widget: DashboardWidget = {
            id,
            dashboard_id: dashboardId,
            widget_type: w.type as WidgetType,
            layout: { x: w.x, y: w.y, w: w.w, h: w.h, i },
            settings: w.settings ? { ...w.settings } : {},
            created_at: previo?.created_at ?? deps.ahora,
        };
        if (w.size) widget.size = w.size;
        return widget;
    });
}

export function marcaPara(t: Pick<DefaultDashboardTemplate, "categoryId">, widgets: readonly WidgetHuella[]): MarcaPlantilla {
    return { cat: t.categoryId, v: VERSION_PREDETERMINADOS, huella: huellaWidgets(widgets) };
}

/** Una pestaña nueva sembrada con su plantilla (y su marca). */
export function sembrarPestana(
    t: DefaultDashboardTemplate,
    deps: Dependencias,
    opciones: { principal?: boolean } = {},
): { dashboard: TableroMarcado; widgets: DashboardWidget[] } {
    const id = deps.uuid();
    const widgets = sembrarWidgets(t, id, deps);
    return {
        dashboard: {
            id,
            profile_id: "local",
            name: t.name,
            is_default: opciones.principal ?? false,
            category: t.categoryId,
            created_at: deps.ahora,
            updated_at: deps.ahora,
            plantilla: marcaPara(t, widgets),
        },
        widgets,
    };
}

/** Todas las predeterminadas (cuenta nueva). La primera marcada `isDefault` es la principal. */
export function generarPredeterminados(plantillas: readonly DefaultDashboardTemplate[], deps: Dependencias): { dashboards: TableroMarcado[]; widgets: Record<string, DashboardWidget[]> } {
    const dashboards: TableroMarcado[] = [];
    const widgets: Record<string, DashboardWidget[]> = {};
    for (const t of plantillas) {
        const s = sembrarPestana(t, deps, { principal: !!t.isDefault });
        dashboards.push(s.dashboard);
        widgets[s.dashboard.id] = s.widgets;
    }
    return { dashboards, widgets };
}

// ── Estado de una pestaña ───────────────────────────────────────────────────

export type EstadoPestana = "al-dia" | "intacta" | "editada";

export function estadoPestana(d: TableroMarcado, widgets: readonly WidgetHuella[]): EstadoPestana {
    const m = d.plantilla;
    if (m?.v === VERSION_PREDETERMINADOS) return "al-dia";
    if (m) return m.huella !== "" && huellaWidgets(widgets) === m.huella ? "intacta" : "editada";
    const legado = d.category ? LEGADO_GEN11[d.category] : undefined;
    return legado && coincideConLegado(widgets, legado.variantes) ? "intacta" : "editada";
}

/** La pestaña que representa a una plantilla: la marcada con ella o, si no, la gen11 de su categoría. */
export function localizarPredeterminada(dashboards: readonly TableroMarcado[], t: Pick<DefaultDashboardTemplate, "categoryId" | "name">): TableroMarcado | undefined {
    const candidatas = dashboards.filter((d) => d.origen !== "persona");
    const marcada = candidatas.find((d) => d.plantilla?.cat === t.categoryId);
    if (marcada) return marcada;
    const sinMarca = candidatas.filter((d) => !d.plantilla && d.category === t.categoryId);
    const nombres = new Set([t.name, LEGADO_GEN11[t.categoryId]?.nombre].filter(Boolean));
    return sinMarca.find((d) => nombres.has(d.name)) ?? sinMarca[0];
}

/** Hay un diseño nuevo de su plantilla que la persona aún no aplicó ni descartó. */
export function novedadDisponible(d: TableroMarcado, plantillas: readonly Pick<DefaultDashboardTemplate, "categoryId">[]): boolean {
    const m = d.plantilla;
    if (!m || m.v === VERSION_PREDETERMINADOS || m.descartada === VERSION_PREDETERMINADOS) return false;
    return plantillas.some((t) => t.categoryId === m.cat);
}

/** Aplica (o restablece) el diseño de su plantilla: widgets nuevos reutilizando ids y marca al día. */
export function aplicarDiseno(
    d: TableroMarcado,
    t: DefaultDashboardTemplate,
    anteriores: readonly DashboardWidget[],
    deps: Dependencias,
): { dashboard: TableroMarcado; widgets: DashboardWidget[] } {
    const widgets = sembrarWidgets(t, d.id, deps, anteriores);
    return { dashboard: { ...d, plantilla: marcaPara(t, widgets), updated_at: deps.ahora }, widgets };
}

export function descartarNovedad(d: TableroMarcado): TableroMarcado {
    if (!d.plantilla) return d;
    return { ...d, plantilla: { ...d.plantilla, descartada: VERSION_PREDETERMINADOS } };
}

// ── La migración ────────────────────────────────────────────────────────────

export interface EntradaMigracion {
    dashboards: readonly TableroMarcado[];
    widgets: Readonly<Record<string, DashboardWidget[]>>;
    /** Categorías predeterminadas que la persona borró a propósito. */
    retirados: readonly string[];
    plantillas: readonly DefaultDashboardTemplate[];
}

export interface InformeMigracion {
    /** Pestañas intactas que recibieron el diseño nuevo. */
    renovadas: string[];
    /** Pestañas con cambios de la persona: se conservan y se les ofrece el diseño nuevo. */
    conservadas: string[];
    /** Temáticas que faltaban y se añadieron. */
    anadidas: string[];
}

export interface ResultadoMigracion {
    dashboards: TableroMarcado[];
    widgets: Record<string, DashboardWidget[]>;
    cambio: boolean;
    informe: InformeMigracion;
}

function mismaMarca(a: MarcaPlantilla | undefined, b: MarcaPlantilla | undefined): boolean {
    return estable(a ?? null) === estable(b ?? null);
}

/**
 * Lleva las pestañas predeterminadas a la generación actual sin tocar lo que la persona hizo.
 * Idempotente: con la misma entrada migrada, devuelve `cambio: false`.
 */
export function migrarPredeterminados(e: EntradaMigracion, deps: Dependencias): ResultadoMigracion {
    const dashboards = e.dashboards.map((d) => ({ ...d }));
    const widgets: Record<string, DashboardWidget[]> = { ...e.widgets };
    const informe: InformeMigracion = { renovadas: [], conservadas: [], anadidas: [] };
    const retirados = new Set(e.retirados);
    let cambio = false;
    const reclamadas = new Set<string>();

    for (const t of e.plantillas) {
        const d = localizarPredeterminada(dashboards.filter((x) => !reclamadas.has(x.id)), t);
        if (!d) {
            if (retirados.has(t.categoryId) || dashboards.some((x) => x.category === t.categoryId)) continue;
            const s = sembrarPestana(t, deps, { principal: !!t.isDefault && !dashboards.some((x) => x.is_default) });
            dashboards.push(s.dashboard);
            widgets[s.dashboard.id] = s.widgets;
            reclamadas.add(s.dashboard.id);
            informe.anadidas.push(t.name);
            cambio = true;
            continue;
        }
        reclamadas.add(d.id);
        const actuales = widgets[d.id] ?? [];
        const estado = estadoPestana(d, actuales);
        if (estado === "al-dia") continue;
        const idx = dashboards.findIndex((x) => x.id === d.id);
        if (estado === "intacta") {
            const r = aplicarDiseno(d, t, actuales, deps);
            dashboards[idx] = r.dashboard;
            widgets[d.id] = r.widgets;
            informe.renovadas.push(d.name);
            cambio = true;
            continue;
        }
        // Editada: se conserva; la marca recuerda de qué plantilla viene (y que hay novedad).
        const marca: MarcaPlantilla = {
            cat: t.categoryId,
            v: d.plantilla?.v ?? "gen11",
            huella: d.plantilla?.huella ?? "",
            ...(d.plantilla?.descartada ? { descartada: d.plantilla.descartada } : {}),
        };
        informe.conservadas.push(d.name);
        if (!mismaMarca(d.plantilla, marca)) {
            dashboards[idx] = { ...d, plantilla: marca };
            cambio = true;
        }
    }
    return { dashboards, widgets, cambio, informe };
}
