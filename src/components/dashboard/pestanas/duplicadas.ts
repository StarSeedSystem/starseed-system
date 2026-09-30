/**
 * Pestañas temáticas duplicadas (2026-09-30) — PURO.
 *
 * Fallo visto en producción: un navegador que nunca había abierto el tablero recibió los tableros
 * de la cuenta (respaldo de `dashboards-sync`) ANTES de su primera visita; al abrirlo, la siembra
 * inicial añadió las 18 temáticas nuevas y además conservó las 18 de la cuenta → 36 pestañas
 * («Inicio», «Inicio», «Política»…), y ese estado viajó a la cuenta.
 *
 * Regla: tras cualquier fusión (y al cargar), cada categoría temática tiene UNA pestaña de fábrica.
 *  · Se queda la compartida con la cuenta (si se sabe) o, si no, la más antigua: así todos los
 *    dispositivos convergen en los mismos ids.
 *  · Las demás se quitan SOLO si son una siembra intacta (mismos widgets, acomodo y ajustes que su
 *    plantilla, su nombre de fábrica, sin icono, color, dispositivos ni fondo propios): no hay
 *    trabajo de nadie que perder.
 *  · Si una tiene cambios de la persona, se conserva y se renombra «<Nombre> (este dispositivo)»
 *    (deja de contar como la de fábrica). Nunca se borra trabajo de la persona.
 *  · Las pestañas creadas por la persona (`origen: "persona"`) o con un nombre propio no se tocan.
 * Idempotente: sobre su propia salida no cambia nada.
 */
import type { DashboardWidget } from "../dashboard-types";
import type { DefaultDashboardTemplate } from "../dashboard-defaults";
import { LEGADO_GEN11 } from "./legado-gen11";
import { coincideConLegado, huellaWidgets, type TableroMarcado } from "./migracion";

export const SUFIJO_DISPOSITIVO = " (este dispositivo)";

export interface EntradaDuplicadas {
    dashboards: readonly TableroMarcado[];
    widgets: Readonly<Record<string, DashboardWidget[]>>;
    plantillas: readonly Pick<DefaultDashboardTemplate, "categoryId" | "name">[];
    /** Ids que se sabe que están en la cuenta (se prefieren al elegir cuál se queda). */
    compartidas?: ReadonlySet<string>;
}

export interface ResultadoDuplicadas {
    dashboards: TableroMarcado[];
    widgets: Record<string, DashboardWidget[]>;
    cambio: boolean;
    informe: { quitadas: string[]; renombradas: string[] };
}

function nombresDeFabrica(cat: string, plantillas: EntradaDuplicadas["plantillas"]): Set<string> {
    return new Set([plantillas.find((t) => t.categoryId === cat)?.name, LEGADO_GEN11[cat]?.nombre].filter((x): x is string => !!x));
}

/** Siembra intacta: nada de la persona dentro (widgets, acomodo, ajustes, nombre, aspecto). */
export function esSiembraIntacta(d: TableroMarcado, widgets: readonly DashboardWidget[], nombres: ReadonlySet<string>, cat: string): boolean {
    if (d.origen === "persona" || !nombres.has(d.name)) return false;
    if (d.icono || d.acento || d.ambiente === "apagado" || (d.deviceTags && d.deviceTags.length > 0)) return false;
    if (d.plantilla) return d.plantilla.huella !== "" && huellaWidgets(widgets) === d.plantilla.huella;
    const legado = LEGADO_GEN11[cat];
    return !!legado && coincideConLegado(widgets, legado.variantes);
}

const tiempo = (s: string | undefined) => {
    const t = s ? Date.parse(s) : NaN;
    return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
};

export function deduplicarPredeterminadas(e: EntradaDuplicadas): ResultadoDuplicadas {
    let dashboards = e.dashboards.map((d) => ({ ...d }));
    const widgets: Record<string, DashboardWidget[]> = { ...e.widgets };
    const informe = { quitadas: [] as string[], renombradas: [] as string[] };
    const compartidas = e.compartidas ?? new Set<string>();
    const quitar = new Set<string>();
    let cambio = false;

    for (const t of e.plantillas) {
        const cat = t.categoryId;
        const grupo = dashboards.filter((d) => d.origen !== "persona" && (d.plantilla?.cat ?? d.category) === cat);
        if (grupo.length < 2) continue;
        const nombres = nombresDeFabrica(cat, e.plantillas);
        // Se queda: la compartida con la cuenta; si no, la más antigua; a igualdad, el id menor.
        const queda = [...grupo].sort((a, b) =>
            Number(compartidas.has(b.id)) - Number(compartidas.has(a.id))
            || tiempo(a.created_at) - tiempo(b.created_at)
            || a.id.localeCompare(b.id))[0];
        for (const d of grupo) {
            if (d.id === queda.id) continue;
            if (esSiembraIntacta(d, widgets[d.id] ?? [], nombres, cat)) {
                quitar.add(d.id);
                informe.quitadas.push(d.name);
                continue;
            }
            // Con cambios de la persona y con nombre de fábrica: se distingue y deja de ser «la de fábrica».
            if (nombres.has(d.name)) {
                const renombrada: TableroMarcado = { ...d, name: `${d.name}${SUFIJO_DISPOSITIVO}`.slice(0, 60), origen: "persona", is_default: d.is_default && !queda.is_default };
                delete renombrada.plantilla;
                dashboards = dashboards.map((x) => (x.id === d.id ? renombrada : x));
                informe.renombradas.push(renombrada.name);
                cambio = true;
            }
        }
    }

    if (quitar.size) {
        const principalPerdida = dashboards.some((d) => quitar.has(d.id) && d.is_default);
        dashboards = dashboards.filter((d) => !quitar.has(d.id));
        for (const id of quitar) delete widgets[id];
        // La principal no se pierde: pasa a la temática que se queda de su categoría (o a la primera).
        if (principalPerdida && !dashboards.some((d) => d.is_default)) {
            const inicio = dashboards.find((d) => (d.plantilla?.cat ?? d.category) === "social" && d.origen !== "persona") ?? dashboards[0];
            if (inicio) dashboards = dashboards.map((d) => (d.id === inicio.id ? { ...d, is_default: true } : d));
        }
        cambio = true;
    }
    return { dashboards, widgets, cambio, informe };
}
