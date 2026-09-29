/**
 * Editor superior del tablero (2026-09-28) — tipos compartidos.
 *
 * El editor que antes se desplegaba desde el borde IZQUIERDO pasa a vivir ARRIBA, justo debajo
 * de la barra de pestañas de los dashboards. Estos tipos son el contrato entre el editor
 * (`editor-superior.tsx` y sus paneles) y quien lo aloja (`dashboard-layout.tsx`).
 */
import type { Dashboard, DashboardWidget, DeviceType, WidgetType } from "../dashboard-types";

/** Los grupos de herramientas del editor; cada uno abre su panel bajo la barra. */
export type GrupoEditor = "widgets" | "acomodo" | "pestana" | "apariencia" | "plantillas" | "sistema";

export const GRUPOS_EDITOR: readonly GrupoEditor[] = ["widgets", "acomodo", "pestana", "apariencia", "plantillas", "sistema"];

/**
 * Tamaño al añadir. Respeta el sistema de versiones por tamaño de los widgets
 * (`src/lib/widgets/forma/tamanos.ts`: micro · s · m · l · xl · panorámico · torre): S/M/L/XL son
 * las tallas de la rejilla (`dashboard-size.ts`) y micro/panorámico/torre fijan la forma para que
 * el widget elija ese diseño al medirse.
 */
export type TallaEditor = "micro" | "S" | "M" | "L" | "XL" | "panoramico" | "torre";

/** Estilo del material de la barra (hereda el «Diseño estético» de la antigua barra lateral). */
export type EstiloBarra = "liquid-crystal" | "cyber-neon" | "aurora-minimal";

/** Aspecto propio de una pestaña: icono (clave de `ICONOS_PESTANA`) y color de acento. */
export interface AspectoPestana {
    icono?: string;
    acento?: string;
}

/** Marca de la plantilla de la que sale una pestaña (ver pestanas/migracion.ts). */
export interface MarcaPlantillaEditor {
    cat: string;
    v: string;
    huella: string;
    descartada?: string;
}

/** Un dashboard con su aspecto opcional (campos aditivos: viajan en el mismo JSON guardado). */
export type DashboardConAspecto = Dashboard & AspectoPestana & {
    /** (2026-09-29) Plantilla temática de la que salió (generación y huella). */
    plantilla?: MarcaPlantillaEditor;
    /** (2026-09-29) Fondo ambiental de la pestaña: automático (del tema) o apagado. */
    ambiente?: "auto" | "apagado";
};

/** Variante de una plantilla temática (pestanas/variantes.ts). */
export type VariantePlantilla = "completo" | "esencial" | "enfoque";

export interface OpcionesAnadir {
    talla: TallaEditor;
    /** (2026-09-29) Huella exacta (p. ej. la «sugerida» por el diseño del tema); manda sobre la talla. */
    dims?: { w: number; h: number };
    /** Celda de destino (rejilla de escritorio, 12 columnas). Sin ella, el mejor hueco libre. */
    posicion?: { x: number; y: number };
}

/** Lo que el editor necesita del tablero que lo aloja. Todo lo destructivo confirma quien lo aloja. */
export interface AccionesEditor {
    // ── Widgets ──
    onAnadirWidget: (type: WidgetType, opciones: OpcionesAnadir) => void;
    onForjar: () => void;
    onCrearDesdePlantilla: (categoryId: string, nombre: string) => void;
    // ── Acomodo ──
    onCambiarWidgets: (widgets: DashboardWidget[]) => void;
    onRestablecerPredeterminados: () => void;
    // ── Pestaña ──
    onRenombrar: (id: string, nombre: string) => void;
    onAspecto: (id: string, aspecto: AspectoPestana) => void;
    onDuplicar: (id: string) => void;
    onMover: (id: string, direccion: "izquierda" | "derecha") => void;
    onEliminar: (id: string) => void;
    onPrincipal: (id: string) => void;
    onNuevaPestana: () => void;
    onCompartir?: (id: string) => void;
    onDispositivos: (id: string, tags: DeviceType[]) => void;
    onGestorDispositivos: () => void;
    onRestaurarTematicas: () => void;
    // ── Plantillas ──
    onAplicarPlantilla: (categoryId: string, variante?: VariantePlantilla) => void;
    // ── (2026-09-29) Diseño del tema de la pestaña ──
    /** Estrena el diseño nuevo de su tema (la persona había cambiado la suya). */
    onAplicarNovedad?: (id: string) => void;
    /** Se queda con su versión: no se vuelve a ofrecer. */
    onDescartarNovedad?: (id: string) => void;
    /** Vuelve al diseño de fábrica de su tema. */
    onRestablecerDiseno?: (id: string) => void;
    onAmbiente?: (id: string, ambiente: "auto" | "apagado") => void;
    onExportar?: (id: string) => void;
    onImportar?: (archivo: File) => void;
    // ── Historial ──
    onDeshacer: () => void;
    onRehacer: () => void;
    // ── Salida ──
    onListo: () => void;
}
