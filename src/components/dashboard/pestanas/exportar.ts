/**
 * Exportar e importar una pestaña (2026-09-29) — PURO.
 *
 * Una pestaña se guarda como un .json legible: su nombre, tema, icono, color, dispositivos y sus
 * widgets con su acomodo y sus ajustes. Importar es lo delicado: el archivo puede venir de
 * cualquiera, así que se valida TODO — solo tipos de widget del manifiesto, números dentro de la
 * rejilla, colores #rrggbb e iconos conocidos — y los widgets forjados por IA (que llevan HTML)
 * no se importan nunca: se cuentan como omitidos y se dice.
 */
import type { DashboardWidget, DeviceType, WidgetType } from "../dashboard-types";
import { WIDGET_MANIFEST } from "../widget-manifest";
import { acentoDePestana, iconoDePestana } from "../editor-superior/aspecto-pestana";
import type { Dependencias, TableroMarcado } from "./migracion";

export const FORMATO_PESTANA = "starseed.pestana.v1";
const MAX_WIDGETS = 60;
const TIPOS_PROHIBIDOS = new Set<string>(["AI_GENERATED"]);
const DISPOSITIVOS: readonly DeviceType[] = ["all", "phone", "tablet", "desktop", "tv", "vr", "watch", "car", "iot"];

export interface PestanaExportada {
    formato: typeof FORMATO_PESTANA;
    exportada: string;
    pestana: {
        nombre: string;
        categoria?: string;
        icono?: string;
        acento?: string;
        dispositivos?: DeviceType[];
        ambiente?: "auto" | "apagado";
    };
    widgets: { tipo: string; x: number; y: number; w: number; h: number; talla?: string; ajustes: Record<string, unknown> }[];
}

export function exportarPestana(d: TableroMarcado, widgets: readonly DashboardWidget[], ahora: string): PestanaExportada {
    return {
        formato: FORMATO_PESTANA,
        exportada: ahora,
        pestana: {
            nombre: d.name,
            ...(d.category ? { categoria: d.category } : {}),
            ...(d.icono ? { icono: d.icono } : {}),
            ...(d.acento ? { acento: d.acento } : {}),
            ...(d.deviceTags?.length ? { dispositivos: [...d.deviceTags] } : {}),
            ...(d.ambiente ? { ambiente: d.ambiente } : {}),
        },
        widgets: widgets
            .filter((w) => !TIPOS_PROHIBIDOS.has(w.widget_type))
            .map((w) => ({
                tipo: w.widget_type,
                x: w.layout.x, y: w.layout.y, w: w.layout.w, h: w.layout.h,
                ...(w.size ? { talla: w.size } : {}),
                ajustes: { ...(w.settings ?? {}) },
            })),
    };
}

/** Nombre de archivo seguro para la descarga. */
export function nombreArchivo(nombre: string): string {
    const base = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
    return `pestana-${base || "starseed"}.json`;
}

const entero = (v: unknown, min: number, max: number, def: number): number => {
    const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : def;
    return Math.max(min, Math.min(max, n));
};

function objetoPlano(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

export type ResultadoImportar =
    | { ok: true; dashboard: TableroMarcado; widgets: DashboardWidget[]; omitidos: number }
    | { ok: false; motivo: string };

/** Lee un archivo exportado (ya parseado o en texto). Nunca lanza. */
export function importarPestana(entrada: unknown, deps: Dependencias): ResultadoImportar {
    let datos: unknown = entrada;
    if (typeof entrada === "string") {
        try { datos = JSON.parse(entrada); } catch { return { ok: false, motivo: "El archivo no es un JSON válido." }; }
    }
    if (!objetoPlano(datos) || datos.formato !== FORMATO_PESTANA) {
        return { ok: false, motivo: "No es una pestaña exportada desde StarSeed." };
    }
    const p = objetoPlano(datos.pestana) ? datos.pestana : {};
    const nombreCrudo = typeof p.nombre === "string" ? p.nombre.trim() : "";
    const nombre = (nombreCrudo || "Pestaña importada").slice(0, 60);
    const lista = Array.isArray(datos.widgets) ? datos.widgets.slice(0, MAX_WIDGETS) : [];
    const id = deps.uuid();
    let omitidos = Array.isArray(datos.widgets) ? Math.max(0, datos.widgets.length - MAX_WIDGETS) : 0;
    const widgets: DashboardWidget[] = [];
    for (const crudo of lista) {
        if (!objetoPlano(crudo) || typeof crudo.tipo !== "string" || TIPOS_PROHIBIDOS.has(crudo.tipo) || !(crudo.tipo in WIDGET_MANIFEST)) {
            omitidos++;
            continue;
        }
        const w = entero(crudo.w, 1, 12, 4);
        const widget: DashboardWidget = {
            id: deps.uuid(),
            dashboard_id: id,
            widget_type: crudo.tipo as WidgetType,
            layout: { x: entero(crudo.x, 0, 12 - w, 0), y: entero(crudo.y, 0, 400, 0), w, h: entero(crudo.h, 1, 40, 4), i: deps.uuid() },
            settings: objetoPlano(crudo.ajustes) ? JSON.parse(JSON.stringify(crudo.ajustes)) : {},
            created_at: deps.ahora,
        };
        if (crudo.talla === "S" || crudo.talla === "M" || crudo.talla === "L" || crudo.talla === "XL") widget.size = crudo.talla;
        widgets.push(widget);
    }
    const dispositivos = Array.isArray(p.dispositivos)
        ? p.dispositivos.filter((x): x is DeviceType => typeof x === "string" && (DISPOSITIVOS as readonly string[]).includes(x))
        : [];
    const dashboard: TableroMarcado = {
        id,
        profile_id: "local",
        name: nombre,
        is_default: false,
        origen: "persona",
        ...(typeof p.categoria === "string" && /^[a-z]{2,24}$/.test(p.categoria) ? { category: p.categoria } : {}),
        created_at: deps.ahora,
        updated_at: deps.ahora,
        ...(typeof p.icono === "string" && iconoDePestana(p.icono) ? { icono: p.icono } : {}),
        ...(typeof p.acento === "string" && acentoDePestana(p.acento) ? { acento: p.acento } : {}),
        ...(dispositivos.length ? { deviceTags: dispositivos } : {}),
        ...(p.ambiente === "apagado" ? { ambiente: "apagado" as const } : {}),
    };
    return { ok: true, dashboard, widgets, omitidos };
}
