// Adaptador de la familia «widget» para las «Variaciones públicas» (contrato §5
// de architecture/variaciones-publicas.md). La clave nombra el TIPO de widget
// (widget:reloj-fecha, compartido por todas las personas), nunca la instancia;
// viaja solo la configuración visual y de opciones del widget, jamás los datos
// personales que esa instancia muestra. Módulo PURO: limites de
// getSizeConstraints (widget-manifest.ts), sin red, disco, Supabase ni DOM;
// el puerto con las instancias del tablero se inyecta.
import type { WidgetType } from "@/components/dashboard/dashboard-types";
import { WIDGET_MANIFEST, getSizeConstraints } from "@/components/dashboard/widget-manifest";
import { SIZE_DIMENSIONS, type WidgetSize } from "@/components/dashboard/dashboard-size";
import type { WidgetStyleVariant, TrinityNode } from "@/components/dashboard/kit/widget-style-override";
import type { AdaptadorFamilia } from "../familias";
import { registrarFamilia } from "../familias";
import { validarVariacion } from "../validar";

/** Solo estas claves de opciones viajan en la clave de una variación. */
export const OPCIONES_WIDGET = ["styleVariant", "trinityNode", "clockMode", "clockZones"] as const;
type ClaveOpcionWidget = (typeof OPCIONES_WIDGET)[number];
const VARIANTES_ESTILO: readonly WidgetStyleVariant[] = ["cristal", "solido", "transparente", "trinity"];
const NODOS_TRINITY: readonly TrinityNode[] = ["zenith", "horizon", "logic", "anchor"];
const esObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const SIN_EFECTO = { deshacer: () => undefined };

/** Cuerpo visual compartido entre una instancia del tablero y su variación. */
export interface CuerpoWidget {
  opciones: Record<string, unknown>;
  tamano?: WidgetSize;
}
export interface InstanciaWidget extends CuerpoWidget { id: string; tipo: WidgetType }
export interface VariacionWidget extends CuerpoWidget { tipo: WidgetType }
export type ResultadoWidget = { ok: true; payload: VariacionWidget } | { ok: false; motivos: string[] };
/** Puerto del tablero que el cableado del Dashboard inyecta. */
export interface PuertoWidgets {
  instancias: () => InstanciaWidget[];
  escribir: (idInstancia: string, cambios: CuerpoWidget) => void;
}

const SIN_EFECTO = { deshacer: () => undefined };

/** Clave canónica de un tipo de widget (kebab, compatible con leerClave). */
export function claveDeWidget(tipo: WidgetType): string {
  return `widget:${tipo.toLowerCase().replace(/_/g, "-")}`;
}
// (siguiente: tipos de clave, opciones visuales y límites de tamaño)
