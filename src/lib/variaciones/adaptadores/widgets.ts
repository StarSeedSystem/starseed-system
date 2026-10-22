// Adaptador de la familia «widget» (contrato: architecture/variaciones-publicas.md §5).
// Una variación lleva la configuración visual y de opciones del widget, nunca datos
// personales: la clave nombra el TIPO compartido (`widget:<WidgetType>`). Módulo puro.

import type { DashboardWidget, WidgetType } from "@/components/dashboard/dashboard-types";
import { getManifest, getSizeConstraints } from "@/components/dashboard/widget-manifest";
import { validarVariacion } from "../validar";

/** Claves de ajustes que cuentan como «visual u opciones» al capturar (listado blanco). */
const CLAVES_VISUALES = new Set(["styleVariant", "trinityNode", "clockMode", "clockZones", "selectedLayout", "ontology", "widgetConfig", "customHtml", "forgePrompt"]);

export interface VariacionWidget {
    tipo: WidgetType;
    opciones: Record<string, unknown>;
    tamano?: { w: number; h: number };
}

export interface EstadoWidgetInstancia {
    widget_type: WidgetType;
    settings: Record<string, unknown>;
    layout?: { w: number; h: number };
}

export type ResultadoValidarWidget =
    | { ok: true; requiereAislamiento: boolean }
    | { ok: false; motivos: string[]; requiereAislamiento: boolean };

export interface ResultadoAplicarWidget {
    widget: DashboardWidget;         // nueva instancia con la variación fusionada
    deshacer: () => DashboardWidget; // devuelve la instancia original intacta
}

/** ¿Es un WidgetType del manifiesto del dashboard? */
export function esTipoWidget(valor: unknown): valor is WidgetType {
    return typeof valor === "string" && getManifest(valor as WidgetType) !== undefined;
}

/** Tipo que porta una clave `widget:<WidgetType>`; null si la clave no es de la familia. */
export function tipoDeClaveWidget(clave: string): WidgetType | null {
    if (!clave.startsWith("widget:") || clave.includes("#")) return null;
    const tipo = clave.slice("widget:".length);
    return esTipoWidget(tipo) ? tipo : null;
}

function clonar<T>(valor: T): T {
    return JSON.parse(JSON.stringify(valor)) as T;
}

/** Captura la configuración visual y de opciones del widget (los datos personales quedan fuera). */
export function capturarWidget(clave: string, estado: EstadoWidgetInstancia): VariacionWidget | null {
    const tipo = tipoDeClaveWidget(clave);
    if (!tipo || tipo !== estado.widget_type) return null;
    const opciones: Record<string, unknown> = {};
    for (const claveAjuste of Object.keys(estado.settings)) {
        // Solo claves del listado blanco: nunca entra un dato personal ni un secreto.
        if (CLAVES_VISUALES.has(claveAjuste)) {
            opciones[claveAjuste] = clonar(estado.settings[claveAjuste]);
        }
    }
    const tamano = estado.layout ? { w: estado.layout.w, h: estado.layout.h } : undefined;
    return tamano ? { tipo, opciones, tamano } : { tipo, opciones };
}

/** Valida la variación antes de aplicarla (contrato §5: nada corre sin validar). */
export function validarVariacionWidget(payload: unknown): ResultadoValidarWidget {
    const base = validarVariacion(payload);
    const motivos = base.ok ? [] : [...base.motivos];
    const v = (typeof payload === "object" && payload !== null ? payload : {}) as { tipo?: unknown; opciones?: unknown; tamano?: unknown };
    const tipo = esTipoWidget(v.tipo) ? v.tipo : null;
    if (tipo === null) motivos.push("Tipo: no es un tipo de widget del manifiesto del dashboard");
    const opciones = typeof v.opciones === "object" && v.opciones !== null && !Array.isArray(v.opciones) ? v.opciones : null;
    if (tipo !== null && !opciones) motivos.push("Opciones: deben ser un objeto de ajustes");
    if (tipo !== null && typeof v.tamano === "object" && v.tamano !== null && !Array.isArray(v.tamano)) {
        const t = v.tamano as { w?: unknown; h?: unknown };
        const w = typeof t.w === "number" ? t.w : undefined;
        const h = typeof t.h === "number" ? t.h : undefined;
        const enteros = w !== undefined && h !== undefined && Number.isInteger(w) && Number.isInteger(h) && w >= 1 && h >= 1;
        const limites = getSizeConstraints(tipo);
        if (!enteros) motivos.push("Tamaño: w y h deben ser enteros mayores o iguales a 1");
        else if (w < limites.minW || h < limites.minH) motivos.push(`Tamaño: el widget no puede ir por debajo de ${limites.minW}×${limites.minH}`);
        else if ((limites.maxW !== undefined && w > limites.maxW) || (limites.maxH !== undefined && h > limites.maxH)) motivos.push(`Tamaño: el tamaño supera el máximo del manifiesto (${limites.maxW ?? limites.maxH})`);
    }
    // El HTML propio del widget es código: se abre solo aislado (contrato §4).
    const llevaHtml = opciones !== null && Object.keys(opciones).includes("customHtml");
    const requiereAislamiento = base.requiereAislamiento || llevaHtml;
    return motivos.length === 0 ? { ok: true, requiereAislamiento } : { ok: false, motivos, requiereAislamiento };
}

/** Aplica la variación fusionándola con la instancia elegida; deshacer devuelve la original. */
export function aplicarWidget(clave: string, payload: VariacionWidget, instancia: DashboardWidget): ResultadoAplicarWidget | null {
    if (!validarVariacionWidget(payload).ok) return null;
    const tipo = tipoDeClaveWidget(clave);
    if (!tipo || tipo !== payload.tipo || instancia.widget_type !== payload.tipo) return null;
    const limites = getSizeConstraints(payload.tipo);
    // Un eje sin tamaño declarado hereda el de la instancia; uno declarado queda siempre
    // dentro de getSizeConstraints (nunca por debajo del mínimo del manifiesto).
    const eje = (dato: number | undefined, minimo: number, maximo: number | undefined, heredar: number): number =>
        dato === undefined ? heredar : Math.min(maximo ?? Infinity, Math.max(minimo, Math.round(dato)));
    const widget: DashboardWidget = {
        ...instancia,
        layout: {
            ...instancia.layout,
            w: eje(payload.tamano?.w, limites.minW, limites.maxW, instancia.layout.w),
            h: eje(payload.tamano?.h, limites.minH, limites.maxH, instancia.layout.h),
        },
        settings: { ...instancia.settings, ...payload.opciones },
    };
    return { widget, deshacer: () => clonar(instancia) };
}

/** Vista previa ligera de la variación, con la etiqueta humana del manifiesto. */
export function vistaPreviaWidget(payload: VariacionWidget) {
    return {
        tipo: payload.tipo,
        etiqueta: getManifest(payload.tipo)?.label ?? payload.tipo,
        opciones: payload.opciones,
        tamano: payload.tamano,
    };
}
