// Familia «widget» de las variaciones públicas (architecture/variaciones-publicas.md §5). La clave
// `widget:<WidgetType>` nombra el TIPO (todas las personas comparten `widget:CLOCK_DATE`), nunca la
// instancia ni sus datos personales. capturar toma la configuración visual y de opciones de la
// instancia elegida; aplicar la fusiona con ella y devuelve deshacer; la huella nueva sale de
// `dimsForSize`, que recorta contra `getSizeConstraints`. Puerto inyectado: módulo PURO.
// Una instancia de widget: `ajustes` es su `settings` completo (capturar solo publicará opciones);
// la huella es el layout w/h. 

import { registrarFamilia, type AdaptadorFamilia } from "../familias";
import { validarVariacion } from "../validar";
import { WIDGET_MANIFEST } from "@/components/dashboard/widget-manifest";
import type { WidgetType } from "@/components/dashboard/dashboard-types";
import { SIZE_ORDER, dimsForSize, type WidgetSize } from "@/components/dashboard/dashboard-size";
import type { TrinityNode, WidgetStyleVariant } from "@/components/dashboard/kit/widget-style-override";
export type InstanciaWidget = {
  id: string;
  tipo: WidgetType;
  ajustes: Record<string, unknown>;
  size?: WidgetSize;
  huella: { w: number; h: number };
};
// Fusión puntual sobre una instancia; el puerto decide dónde persiste.
export type CambiosInstancia = { ajustes?: Record<string, unknown>; size?: WidgetSize; huella?: { w: number; h: number } };
// Puerto del dashboard: qué instancia del tipo está elegida y cómo se fusiona en ella.
export interface PuertoWidgets {
  elegida: (tipo: WidgetType) => InstanciaWidget | null;
  fusionar: (id: string, cambios: CambiosInstancia) => void;
}
// Payload publicable y su resultado validado.
export type ParcheWidget = { widgetType: WidgetType; ajustes: Record<string, unknown>; size?: WidgetSize };
export type ResultadoParcheWidget = { ok: true; parche: ParcheWidget } | { ok: false; motivos: string[] };
const CAMPOS = ["widgetType", "ajustes", "size"] as const;
const esObjetoPlano = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const fallo = (motivos: string[]) => ({ ok: false as const, motivos });
const VARIANTES = ["cristal", "solido", "transparente", "trinity"] as const; // estilos del kit
const NODOS = ["zenith", "horizon", "logic", "anchor"] as const; // nodos Trinity
// Opciones publicables, medidas en los paneles reales del OS: panel de estilo del kit (styleVariant
// y trinityNode), reloj (clockMode y clockZones) y Fragua IA (widgetConfig y selectedLayout). La
// lista crece con los paneles; fuera contenido creado y datos personales.
export const OPCIONES_WIDGET: Record<string, (v: unknown) => string | null> = {
  styleVariant: (v) => ((VARIANTES as readonly unknown[]).includes(v) ? null : "el estilo es «cristal», «solido», «transparente» o «trinity»"),
  trinityNode: (v) => ((NODOS as readonly unknown[]).includes(v) ? null : "el nodo Trinity es «zenith», «horizon», «logic» o «anchor»"),
  clockMode: (v) => (v === "digital" || v === "analog" ? null : "el modo del reloj es «digital» o «analog»"),
  clockZones: (v) => (Array.isArray(v) && v.length <= 8 && v.every((z) => typeof z === "string" && z.length <= 40) ? null : "las zonas del reloj son una lista de hasta 8 textos"),
  widgetConfig: (v) => (esObjetoPlano(v) && Object.values(v).every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 400) ? null : "«widgetConfig» debe ser un objeto de números finitos (|v| ≤ 400)"),
  selectedLayout: (v) => (typeof v === "string" && v.length > 0 && v.length <= 40 ? null : "el layout de la Fragua debe ser un texto corto"),
};
export function claveDeWidget(tipo: WidgetType): string { return `widget:${tipo}`; }
/** El WidgetType de una clave `widget:<tipo>`, solo si está en el manifiesto; nulo si no. */
export function tipoDeClave(clave: string): WidgetType | null {
  const tipo = /^widget:([A-Z][A-Z0-9_]{0,39})$/.exec(clave)?.[1] ?? null;
  return tipo && WIDGET_MANIFEST[tipo as WidgetType] ? (tipo as WidgetType) : null;
}
/** Valida: campos exactos, tipo del manifiesto, opciones publicables y algo que cambiar. */
export function validarParcheWidget(payload: unknown): ResultadoParcheWidget {
  const base = validarVariacion(payload);
  if (!base.ok) return fallo(base.motivos);
  if (!esObjetoPlano(payload)) return fallo(["Widget: el payload debe ser un objeto { widgetType, ajustes, size? }"]);
  const p = payload as Record<string, unknown>;
  const motivos = Object.keys(p).filter((k) => !(CAMPOS as readonly string[]).includes(k)).map((k) => `Widget: «${k}» no es un campo de esta variación`);
  const tipo = typeof p.widgetType === "string" && /^[A-Z][A-Z0-9_]{0,39}$/.test(p.widgetType) ? (p.widgetType as WidgetType) : null;
  if (!tipo) motivos.push("Widget: el tipo de widget no es válido");
  else if (!WIDGET_MANIFEST[tipo]) motivos.push(`Widget: «${tipo}» no está en el manifiesto del dashboard`);
  const ajustes = esObjetoPlano(p.ajustes) ? p.ajustes : null;
  if (!ajustes) motivos.push("Widget: los ajustes deben ser un objeto de opciones");
  for (const [clave, valor] of ajustes ? Object.entries(ajustes) : []) {
    const revisar = OPCIONES_WIDGET[clave];
    if (!revisar) motivos.push(`Widget: «${clave}» no es una opción publicable del widget`);
    else { const error = revisar(valor); if (error) motivos.push(`Widget: ${clave} — ${error}`); }
  }
  if ("size" in p && !(SIZE_ORDER as readonly string[]).includes(p.size as string)) motivos.push("Widget: el tamaño es «S», «M», «L» o «XL»");
  if (motivos.length === 0 && (!ajustes || Object.keys(ajustes).length === 0) && !("size" in p)) motivos.push("Widget: la variación no cambia nada");
  if (motivos.length > 0) return fallo(motivos);
  return { ok: true, parche: { widgetType: tipo as WidgetType, ajustes: p.ajustes as Record<string, unknown>, ...("size" in p ? { size: p.size as WidgetSize } : {}) } };
}
/** Solo las opciones conocidas y válidas viajan; lo demás (contenido, datos) queda fuera. */
export function opcionesPublicables(ajustes: Record<string, unknown>): Record<string, unknown> {
  const limpio: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(ajustes)) { const revisar = OPCIONES_WIDGET[clave]; if (revisar && revisar(valor) === null) limpio[clave] = valor; }
  return limpio;
}
/** Captura la variación del TIPO desde la instancia elegida; nulo si no hay nada propio que publicar. */
export function capturaWidget(puerto: PuertoWidgets, clave: string): ParcheWidget | null {
  const tipo = tipoDeClave(clave);
  const inst = tipo === null ? null : puerto.elegida(tipo);
  if (tipo === null || inst === null) return null;
  const ajustes = opcionesPublicables(inst.ajustes);
  if (Object.keys(ajustes).length === 0 && inst.size === undefined) return null;
  return { widgetType: tipo, ajustes, ...(inst.size !== undefined ? { size: inst.size } : {}) };
}

/** Aplica la variación a la instancia elegida: valida, fusiona en superficie y devuelve deshacer. */
export function aplicarWidget(puerto: PuertoWidgets, clave: string, payload: unknown): () => void {
  const r = validarParcheWidget(payload);
  if (!r.ok) throw new Error(`Variación de widget rechazada: ${r.motivos.join(" · ")}`);
  const tipo = tipoDeClave(clave);
  if (!tipo || tipo !== r.parche.widgetType) throw new Error("Widget: la clave no coincide con el tipo de la variación");
  const inst = puerto.elegida(tipo);
  if (!inst) throw new Error(`Widget: «${tipo}» no tiene instancia elegida en este dashboard`);
  const previo: CambiosInstancia = { ajustes: inst.ajustes, huella: inst.huella, ...(inst.size !== undefined ? { size: inst.size } : {}) };
  puerto.fusionar(inst.id, { ajustes: { ...inst.ajustes, ...r.parche.ajustes }, ...(r.parche.size !== undefined ? { size: r.parche.size, huella: dimsForSize(r.parche.widgetType, r.parche.size) } : {}) });
  return () => puerto.fusionar(inst.id, previo);
}

/** Adaptador de la familia «widget» de las variaciones públicas. */
export function crearAdaptadorWidgets(puerto: PuertoWidgets): AdaptadorFamilia<ParcheWidget> {
  return {
    familia: "widget",
    nombre: "Widgets del Dashboard",
    capturar: (clave) => capturaWidget(puerto, clave),
    validar: (payload) => { const r = validarParcheWidget(payload); return r.ok ? { ok: true, payload: r.parche } : { ok: false, motivos: r.motivos }; },
    aplicar: (clave, payload) => ({ deshacer: aplicarWidget(puerto, clave, payload) }),
  };
}

/** Registra la familia «widget» en el registro común de familias del clic derecho. */
export function registrarAdaptadorWidgets(puerto: PuertoWidgets): void {
  registrarFamilia(crearAdaptadorWidgets(puerto));
}
